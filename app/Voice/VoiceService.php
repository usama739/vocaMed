<?php

namespace App\Voice;

use App\Booking\SlotService;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Patient;
use App\Models\Service;
use App\Support\ClinicClock;
use App\Support\PhoneNumber;
use App\Support\TenantContext;
use App\Voice\Text\NameMatcher;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Turns what a parser heard into this clinic's real records: the patient (by phone number first, then the closest name), the doctor, a
 * service that doctor offers, and a time that can really be booked. It runs inside the clinic (a request or a job), so it only ever sees
 * this clinic's people. It never books and never invents: whatever it cannot find stays empty, and whatever it is unsure of is listed in
 * `lowConfidence` for the receptionist to check on the review card.
 */
class VoiceService
{
    /** Below this a name is not taken to be the one heard. */
    private const MATCH = 0.7;

    /** At or above this (and clearly ahead of the next name) a match is trusted without a warning. */
    private const CONFIDENT = 0.85;

    /** Two names this close in score are a toss-up, whichever is first. */
    private const AMBIGUOUS = 0.05;

    public function __construct(private readonly SlotService $slots) {}

    /** The context a parser reads with: the clinic's day, and the names it uses for doctors and services. */
    public function contextFor(Clinic $clinic): ParseContext
    {
        $now = CarbonImmutable::now($clinic->timezone);

        return new ParseContext(
            $now,
            $clinic->timezone,
            array_values(array_map('strval', Doctor::query()->where('is_active', true)->orderBy('display_name')->pluck('display_name')->all())),
            array_values(array_map('strval', Service::query()->where('is_active', true)->orderBy('name')->pluck('name')->all())),
        );
    }

    /**
     * Spelling hints for the speech provider: this clinic's doctors and services, so "Laith Garner" is written the way the clinic writes it
     * instead of as something that sounds like it. Cut at a name boundary to fit the provider's limit on how long a hint may be.
     */
    public function speechPrompt(): ?string
    {
        $context = $this->contextFor(Clinic::query()->findOrFail(app(TenantContext::class)->requireId()));

        return SpeechHints::prompt($context->doctorNames, $context->serviceNames, (int) config('vocamed.voice.speech.prompt_characters', 500));
    }

    public function resolve(Clinic $clinic, string $heard, ParsedIntent $intent): VoiceDraft
    {
        $low = [];

        [$patientId, $patientName, $phone, $patientDoubt] = $this->patient($clinic, $intent);

        [$doctor, $doctorDoubt] = $this->doctor($intent);
        [$service, $serviceDoubt] = $this->service($doctor, $intent);
        [$startsAt, $timeDoubt] = $this->time($clinic, $doctor, $service, $intent);

        foreach (['patient' => $patientDoubt, 'doctor' => $doctorDoubt, 'service' => $serviceDoubt, 'time' => $timeDoubt] as $field => $doubt) {
            if ($doubt) {
                $low[] = $field;
            }
        }

        return new VoiceDraft($heard, $patientId, $patientName, $phone, $doctor?->id, $service?->id, $startsAt, $low);
    }

    /**
     * @return array{0: string|null, 1: string, 2: string, 3: bool} patient id, name, phone, whether to ask for a check
     */
    private function patient(Clinic $clinic, ParsedIntent $intent): array
    {
        $patients = Patient::query()->orderBy('name')->get(['id', 'name', 'phone']);
        $phone = $intent->patientPhone === null ? null : PhoneNumber::normalize($intent->patientPhone, $clinic->callingCode());

        // A phone number names one patient exactly. If the name heard is nothing like theirs, something is off: ask for a check.
        if ($phone !== null && ($known = $patients->firstWhere('phone', $phone)) instanceof Patient) {
            $nameFits = $intent->patientName === null || NameMatcher::score($intent->patientName, $known->name) >= 0.5;

            return [$known->id, $known->name, (string) $known->phone, ! $nameFits];
        }

        if ($intent->patientName !== null) {
            [$match, $sure] = $this->closest($patients, $intent->patientName, fn (Patient $p) => $p->name);

            if ($match instanceof Patient) {
                return [$match->id, $match->name, (string) ($match->phone ?? $phone), ! $sure];
            }
        }

        // Nobody known by that name or number: the card offers them as a new patient, with what was heard.
        return [null, $intent->patientName ?? '', $phone ?? '', true];
    }

    /**
     * @return array{0: Doctor|null, 1: bool}
     */
    private function doctor(ParsedIntent $intent): array
    {
        $doctors = Doctor::query()->where('is_active', true)->orderBy('display_name')->get();

        if ($intent->doctorName !== null) {
            [$match, $sure] = $this->closest($doctors, $intent->doctorName, fn (Doctor $d) => $d->display_name);

            return [$match, ! $sure];
        }

        // Nobody was named: with only one doctor there is no choice to make, but it is still shown for a check.
        return [$doctors->count() === 1 ? $doctors->first() : null, true];
    }

    /**
     * @return array{0: Service|null, 1: bool}
     */
    private function service(?Doctor $doctor, ParsedIntent $intent): array
    {
        $offered = $doctor === null
            ? Service::query()->where('is_active', true)->orderBy('name')->get()
            : $doctor->services()->where('services.is_active', true)->orderBy('services.name')->get();

        if ($intent->serviceName !== null) {
            [$match, $sure] = $this->closest($offered, $intent->serviceName, fn (Service $s) => $s->name);

            return [$match, ! $sure];
        }

        // Nothing named, and the doctor does only one thing: that is the service, and nothing to check.
        if ($doctor !== null && $offered->count() === 1) {
            return [$offered->first(), false];
        }

        return [null, true];
    }

    /**
     * A time that can really be booked: the one asked for, else the nearest one to it (said so with a warning), else the first free time on
     * the day or after now when no time was given at all.
     *
     * @return array{0: CarbonImmutable|null, 1: bool}
     */
    private function time(Clinic $clinic, ?Doctor $doctor, ?Service $service, ParsedIntent $intent): array
    {
        if ($doctor === null || $service === null) {
            return [null, true];
        }

        $clock = ClinicClock::for($clinic);

        if ($intent->date === null && $intent->time === null) {
            return [$this->slots->nextFree($clinic, $doctor, $service)?->startsAt, true];
        }

        $guessedDay = $intent->date === null;
        $date = $intent->date;

        if ($date === null) {
            // A time with no day is today if it is still to come, otherwise tomorrow.
            $now = $clock->now();
            $date = ($intent->time ?? '00:00') > $clock->timeOf($now) ? $clock->today() : $now->addDay()->format('Y-m-d');
        }

        $free = array_values(array_filter($this->slots->slots($clinic, $doctor, $service, $date), fn ($slot) => $slot->isBookable()));

        if ($intent->time === null) {
            return [$free[0]->startsAt ?? null, true];
        }

        $wanted = $clock->toInstant($date, $intent->time);

        foreach ($free as $slot) {
            if ($slot->startsAt->equalTo($wanted)) {
                return [$slot->startsAt, $guessedDay];
            }
        }

        // That time is not offered (closed, taken, or between the doctor's slots): propose the nearest one and say so.
        $nearest = $this->slots->alternatives($clinic, $doctor, $service, $wanted, 1)[0]['startsAt'] ?? null;

        return [$nearest === null ? null : CarbonImmutable::parse($nearest), true];
    }

    /**
     * The candidate whose name is closest to what was heard, and whether to trust it: it must be a good match and clearly better than the
     * next one (two Ayeshas are a toss-up).
     *
     * @template T of \Illuminate\Database\Eloquent\Model
     *
     * @param  Collection<int, T>  $candidates
     * @param  callable(T): string  $nameOf
     * @return array{0: T|null, 1: bool}
     */
    private function closest(Collection $candidates, string $heard, callable $nameOf): array
    {
        $best = null;
        $bestScore = 0.0;
        $runnerUp = 0.0;

        foreach ($candidates as $candidate) {
            $score = NameMatcher::score($heard, $nameOf($candidate));

            if ($score > $bestScore) {
                $runnerUp = $bestScore;
                [$best, $bestScore] = [$candidate, $score];
            } elseif ($score > $runnerUp) {
                $runnerUp = $score;
            }
        }

        if ($best === null || $bestScore < self::MATCH) {
            return [null, false];
        }

        return [$best, $bestScore >= self::CONFIDENT && $bestScore - $runnerUp > self::AMBIGUOUS];
    }
}
