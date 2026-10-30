<?php

namespace Tests\Feature\Patients;

use App\Models\Clinic;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\AssertsShape;
use Tests\TestCase;

class PatientsTest extends TestCase
{
    use AssertsShape, RefreshDatabase;

    private Clinic $clinic;

    private User $reception;

    protected function setUp(): void
    {
        parent::setUp();

        config(['vocamed.real_auth' => true]);
        $this->clinic = Clinic::factory()->create(['country' => 'PK', 'default_locale' => 'en']);
        $this->reception = User::factory()->receptionist()->forClinic($this->clinic)->create();
    }

    private function create(array $input, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->reception)->postJson(route('api.patients.store'), $input);
    }

    private function change(Patient|string $patient, array $patch, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->reception)->patchJson(route('api.patients.update', is_string($patient) ? $patient : $patient->id), $patch);
    }

    private function search(string $q, array $extra = [], ?User $as = null): array
    {
        return $this->actingAs($as ?? $this->reception)->getJson(route('api.patients.search', ['q' => $q, ...$extra]))->assertOk()->json();
    }

    private function names(array $patients): array
    {
        return array_column($patients, 'name');
    }

    private function actions(): array
    {
        return DB::table('audit_logs')->orderBy('id')->pluck('action')->all();
    }

    // Creating

    public function test_the_read_model_has_the_shape_the_screen_is_tested_with()
    {
        $made = $this->create(['name' => 'Ayesha Khan', 'phone' => '0300 1234567', 'preferredLocale' => 'ur', 'consent' => true, 'notes' => 'Prefers mornings'])->assertCreated()->json();

        $this->assertSameShape($this->fixture('patient'), $made);
        $this->assertSameShape($this->fixture('patient'), $this->actingAs($this->reception)->getJson(route('api.patients.show', $made['id']))->json());
    }

    public function test_a_patient_is_created_with_a_clean_name_an_international_phone_and_sensible_defaults()
    {
        $made = $this->create(['name' => '  Muhammad   Ali  ', 'phone' => '(0300) 123-4567'])->assertCreated()
            ->assertJson(['name' => 'Muhammad Ali', 'phone' => '+923001234567', 'preferredLocale' => 'en', 'preferredChannel' => 'sms', 'consent' => false, 'noShowCount' => 0, 'notes' => ''])->json();

        $this->assertSame($this->clinic->id, $made['clinicId']);
        $this->assertSame(['patient.created'], $this->actions());
    }

    public function test_the_clinics_language_is_the_default_language()
    {
        $this->clinic->forceFill(['default_locale' => 'ur'])->save();

        $this->create(['name' => 'Bilal', 'phone' => '0300 1234567'])->assertCreated()->assertJson(['preferredLocale' => 'ur']);
    }

    public function test_consent_is_recorded_when_given()
    {
        $this->create(['name' => 'A', 'phone' => '0300 1111111', 'consent' => true])->assertCreated()->assertJson(['consent' => true]);
        $this->assertNotNull(DB::table('patients')->value('consent_at'));
    }

    public function test_notes_are_stored_encrypted_and_read_back_plainly()
    {
        $id = $this->create(['name' => 'A', 'phone' => '0300 1111111', 'notes' => 'Allergic to nothing in particular'])->assertCreated()->json('id');

        $stored = (string) DB::table('patients')->value('notes');
        $this->assertStringNotContainsString('Allergic', $stored);
        $this->assertNotSame('', $stored);
        $this->assertSame('Allergic to nothing in particular', $this->actingAs($this->reception)->getJson(route('api.patients.show', $id))->json('notes'));
    }

    public function test_walk_ins_can_be_added_with_a_name_only_and_there_can_be_many()
    {
        $one = $this->create(['name' => 'Walk In One', 'phone' => '', 'noPhone' => true])->assertCreated()->assertJson(['phone' => ''])->json();
        $this->create(['name' => 'Walk In Two', 'noPhone' => true])->assertCreated()->assertJson(['phone' => '']);

        $this->assertSame(2, Patient::query()->whereNull('phone')->count());
        $this->assertSame('', $this->actingAs($this->reception)->getJson(route('api.patients.show', $one['id']))->json('phone'));
    }

    public function test_a_missing_phone_without_the_no_phone_flag_is_an_invalid_phone()
    {
        $this->create(['name' => 'No Number'])->assertStatus(422)->assertJsonPath('code', 'INVALID_PHONE')->assertJsonPath('field', 'phone');
        $this->create(['name' => 'No Number', 'phone' => '  '])->assertStatus(422)->assertJsonPath('code', 'INVALID_PHONE');
        $this->assertSame(0, Patient::query()->count());
    }

    public function test_a_phone_that_cannot_be_one_is_refused_on_the_phone_field()
    {
        foreach (['12', 'abc', '0300-ABC-DEF', '+9230012345678901234'] as $phone) {
            $this->create(['name' => 'X', 'phone' => $phone])->assertStatus(422)->assertJsonPath('code', 'INVALID_PHONE')->assertJsonPath('field', 'phone');
        }
    }

    public function test_a_number_belongs_to_one_patient_however_it_is_typed()
    {
        $this->create(['name' => 'First', 'phone' => '0300 1234567'])->assertCreated();

        foreach (['+92 300 1234567', '03001234567', '3001234567'] as $typed) {
            $this->create(['name' => 'Second', 'phone' => $typed])->assertStatus(422)->assertJsonPath('code', 'DUPLICATE_PHONE')->assertJsonPath('field', 'phone');
        }

        $this->assertSame(1, Patient::query()->count());
    }

    public function test_the_same_number_may_belong_to_a_patient_of_another_clinic()
    {
        $other = User::factory()->receptionist()->forClinic(Clinic::factory()->create())->create();

        $this->create(['name' => 'Here', 'phone' => '0300 1234567'])->assertCreated();
        $this->create(['name' => 'There', 'phone' => '0300 1234567'], $other)->assertCreated();
    }

    public function test_the_database_itself_refuses_a_second_patient_with_the_same_number()
    {
        Patient::factory()->forClinic($this->clinic)->create(['phone' => '+923001234567']);

        $this->expectException(UniqueConstraintViolationException::class);

        DB::table('patients')->insert(['id' => '01JDUPLICATE00000000000000', 'clinic_id' => $this->clinic->id, 'name' => 'Race', 'phone' => '+923001234567', 'preferred_locale' => 'en', 'preferred_channel' => 'sms', 'created_at' => now(), 'updated_at' => now()]);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function badInputs(): array
    {
        return [
            'no name' => [['name' => '  '], 'name'],
            'name too long' => [['name' => str_repeat('a', 121)], 'name'],
            'a language that is not offered' => [['preferredLocale' => 'fr'], 'preferredLocale'],
            'a channel that is not offered' => [['preferredChannel' => 'fax'], 'preferredChannel'],
            'notes too long' => [['notes' => str_repeat('a', 1001)], 'notes'],
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('badInputs')]
    public function test_bad_input_is_refused_on_its_field_and_nothing_is_saved(array $overrides, string $field)
    {
        $this->create([...['name' => 'Ok', 'phone' => '0300 1234567'], ...$overrides])->assertStatus(422)->assertJsonPath('code', 'VALIDATION')->assertJsonPath('field', $field);

        $this->assertSame(0, Patient::query()->count());
        $this->assertSame([], $this->actions());
    }

    // Editing

    public function test_only_the_fields_sent_change()
    {
        $patient = Patient::factory()->forClinic($this->clinic)->create(['name' => 'Before', 'phone' => '+923001234567', 'preferred_locale' => 'en']);

        $this->change($patient, ['name' => ' After  Name '])->assertOk()->assertJson(['name' => 'After Name', 'phone' => '+923001234567', 'preferredLocale' => 'en']);
        $this->change($patient, ['preferredLocale' => 'ur', 'preferredChannel' => 'whatsapp'])->assertOk()->assertJson(['name' => 'After Name', 'preferredLocale' => 'ur', 'preferredChannel' => 'whatsapp']);
    }

    public function test_the_phone_can_be_changed_normalised_and_kept_without_clashing_with_itself()
    {
        $patient = Patient::factory()->forClinic($this->clinic)->create(['phone' => '+923001234567']);

        $this->change($patient, ['phone' => '0300 1234567'])->assertOk()->assertJson(['phone' => '+923001234567']);
        $this->change($patient, ['phone' => '0311 7654321'])->assertOk()->assertJson(['phone' => '+923117654321']);
    }

    public function test_a_number_that_is_another_patients_is_refused_and_a_phone_cannot_be_cleared()
    {
        Patient::factory()->forClinic($this->clinic)->create(['phone' => '+923001111111']);
        $patient = Patient::factory()->forClinic($this->clinic)->create(['phone' => '+923002222222']);

        $this->change($patient, ['phone' => '0300 1111111'])->assertStatus(422)->assertJsonPath('code', 'DUPLICATE_PHONE')->assertJsonPath('field', 'phone');
        $this->change($patient, ['phone' => ''])->assertStatus(422)->assertJsonPath('code', 'INVALID_PHONE');
        $this->assertSame('+923002222222', $patient->fresh()->phone);
    }

    public function test_a_walk_in_can_be_given_a_number_later()
    {
        $patient = Patient::factory()->forClinic($this->clinic)->withoutPhone()->create();

        $this->change($patient, ['phone' => '0300 5555555'])->assertOk()->assertJson(['phone' => '+923005555555']);
    }

    public function test_consent_is_recorded_kept_and_withdrawn()
    {
        $patient = Patient::factory()->forClinic($this->clinic)->create();

        $this->change($patient, ['consent' => true])->assertOk()->assertJson(['consent' => true]);
        $first = $patient->fresh()->consent_at;
        Carbon::setTestNow(now()->addDay());
        $this->change($patient, ['consent' => true])->assertOk();
        $this->assertEquals($first, $patient->fresh()->consent_at, 'consent given again keeps the first time');
        $this->change($patient, ['consent' => false])->assertOk()->assertJson(['consent' => false]);
        $this->assertNull($patient->fresh()->consent_at);
        Carbon::setTestNow();
    }

    public function test_an_edit_is_audited_by_the_names_of_the_fields_never_their_values()
    {
        $patient = Patient::factory()->forClinic($this->clinic)->create(['phone' => '+923001234567']);

        $this->change($patient, ['name' => 'Secret Name', 'phone' => '0300 9998888', 'notes' => 'a private note'])->assertOk();

        $row = DB::table('audit_logs')->where('action', 'patient.updated')->first();
        $this->assertSame(['fields' => 'name,phone,notes'], json_decode($row->meta, true));
        $this->assertSame((string) $this->reception->id, $row->actor_id);
        $this->assertSame($patient->id, $row->subject_id);
        $this->assertStringNotContainsString('Secret', (string) $row->meta);
        $this->assertStringNotContainsString('9998888', (string) $row->meta);
        $this->assertStringNotContainsString('private', (string) $row->meta);
    }

    public function test_saving_what_is_already_there_writes_no_entry()
    {
        $patient = Patient::factory()->forClinic($this->clinic)->create(['name' => 'Same', 'phone' => '+923001234567']);

        $this->change($patient, ['name' => 'Same', 'phone' => '0300 1234567', 'preferredLocale' => 'en'])->assertOk();

        $this->assertSame([], $this->actions());
    }

    // Finding

    public function test_a_phone_search_finds_by_digits_ignoring_a_leading_zero_and_lists_phone_matches_before_names()
    {
        Patient::factory()->forClinic($this->clinic)->create(['name' => 'Zara Byphone', 'phone' => '+923001234567']);
        Patient::factory()->forClinic($this->clinic)->create(['name' => 'Alina 300 Byname', 'phone' => '+923119999999']);

        $this->assertSame(['Zara Byphone', 'Alina 300 Byname'], $this->names($this->search('300')), 'the phone match comes first, then the name that contains the text');
        $this->assertSame(['Zara Byphone'], $this->names($this->search('0300')), 'a leading zero is ignored for the phone, and no name contains 0300');
        $this->assertSame(['Zara Byphone'], $this->names($this->search('300 1234')));
        $this->assertSame(['Zara Byphone'], $this->names($this->search('+92 300 123')));
    }

    public function test_fewer_than_three_digits_do_not_search_by_phone_and_an_empty_query_finds_nothing()
    {
        Patient::factory()->forClinic($this->clinic)->create(['name' => 'Someone', 'phone' => '+923001234567']);

        $this->assertSame([], $this->search('30'));
        $this->assertSame([], $this->search(''));
        $this->assertSame([], $this->search('   '));
    }

    public function test_a_name_search_matches_any_part_ignoring_letter_case()
    {
        Patient::factory()->forClinic($this->clinic)->create(['name' => 'Ayesha Khan']);
        Patient::factory()->forClinic($this->clinic)->create(['name' => 'Bilal Ahmed']);
        Patient::factory()->forClinic($this->clinic)->create(['name' => 'عائشہ خان']);

        $this->assertSame(['Ayesha Khan'], $this->names($this->search('ayesha')));
        $this->assertSame(['Ayesha Khan'], $this->names($this->search('KHAN')));
        $this->assertSame(['Bilal Ahmed'], $this->names($this->search('l ah')));
        $this->assertSame(['عائشہ خان'], $this->names($this->search('عائشہ')));
        $this->assertSame([], $this->search('nobody'));
    }

    public function test_the_characters_that_are_wildcards_in_a_database_search_are_ordinary_text()
    {
        Patient::factory()->forClinic($this->clinic)->create(['name' => 'Ayesha Khan']);
        Patient::factory()->forClinic($this->clinic)->create(['name' => '100% Real_Name']);

        $this->assertSame([], $this->search('%x'));
        $this->assertSame(['100% Real_Name'], $this->names($this->search('0% r')));
        $this->assertSame(['100% Real_Name'], $this->names($this->search('l_n')));
        $this->assertSame([], $this->search('!'));
    }

    public function test_the_number_of_results_is_limited_to_ten_by_default_and_never_more_than_twenty_five()
    {
        foreach (range(1, 30) as $i) {
            Patient::factory()->forClinic($this->clinic)->create(['name' => sprintf('Common Name %02d', $i)]);
        }

        $this->assertCount(10, $this->search('common'));
        $this->assertCount(3, $this->search('common', ['limit' => 3]));
        $this->assertCount(25, $this->search('common', ['limit' => 500]));
        $this->assertCount(1, $this->search('common', ['limit' => 0]));
    }

    public function test_search_and_recent_never_cross_clinics()
    {
        Patient::factory()->forClinic(Clinic::factory()->create())->create(['name' => 'Ayesha Foreign', 'phone' => '+923001234567']);
        Patient::factory()->forClinic($this->clinic)->create(['name' => 'Ayesha Local', 'phone' => '+923119999999']);

        $this->assertSame(['Ayesha Local'], $this->names($this->search('ayesha')));
        $this->assertSame([], $this->search('300 1234'));
        $this->assertSame(['Ayesha Local'], $this->names($this->actingAs($this->reception)->getJson(route('api.patients.recent'))->json()));
    }

    public function test_recent_lists_the_newest_first_and_honours_the_limit()
    {
        foreach (['Old', 'Middle', 'New'] as $i => $name) {
            Carbon::setTestNow('2026-10-30 09:0'.$i.':00');
            Patient::factory()->forClinic($this->clinic)->create(['name' => $name]);
        }
        Carbon::setTestNow();

        $this->assertSame(['New', 'Middle', 'Old'], $this->names($this->actingAs($this->reception)->getJson(route('api.patients.recent'))->json()));
        $this->assertSame(['New', 'Middle'], $this->names($this->actingAs($this->reception)->getJson(route('api.patients.recent', ['limit' => 2]))->json()));
    }

    public function test_search_is_limited_to_one_hundred_and_twenty_requests_a_minute_per_person()
    {
        RateLimiter::clear('patient-search:'.$this->reception->id);

        for ($i = 0; $i < 120; $i++) {
            $this->actingAs($this->reception)->getJson(route('api.patients.search', ['q' => 'a']))->assertOk();
        }

        $this->actingAs($this->reception)->getJson(route('api.patients.search', ['q' => 'a']))->assertStatus(429)->assertJsonPath('code', 'RATE_LIMITED');
    }

    // Who and whose

    public function test_another_clinics_patient_is_not_found_to_read_or_change()
    {
        $foreign = Patient::factory()->forClinic(Clinic::factory()->create())->create(['name' => 'Foreign']);

        $this->actingAs($this->reception)->getJson(route('api.patients.show', $foreign->id))->assertNotFound()->assertJsonPath('code', 'NOT_FOUND');
        $this->change($foreign, ['name' => 'Hijacked'])->assertNotFound();
        $this->assertSame('Foreign', $foreign->fresh()->name);
    }

    public function test_the_clinic_cannot_be_chosen_by_the_request()
    {
        $other = Clinic::factory()->create();

        $made = $this->create(['name' => 'Mine', 'phone' => '0300 1234567', 'clinicId' => $other->id, 'clinic_id' => $other->id])->assertCreated()->json();

        $this->assertSame($this->clinic->id, $made['clinicId']);
        $this->assertSame(0, DB::table('patients')->where('clinic_id', $other->id)->count());
    }

    public function test_the_clinic_admin_and_the_receptionist_may_use_patients_and_a_doctor_may_not()
    {
        $admin = User::factory()->clinicAdmin()->forClinic($this->clinic)->create();
        $doctor = User::factory()->doctor()->forClinic($this->clinic)->create();
        $patient = Patient::factory()->forClinic($this->clinic)->create();

        $this->create(['name' => 'By Admin', 'phone' => '0300 7777777'], $admin)->assertCreated();
        $this->actingAs($admin)->getJson(route('api.patients.show', $patient->id))->assertOk();

        $this->create(['name' => 'By Doctor', 'phone' => '0300 8888888'], $doctor)->assertForbidden();
        $this->actingAs($doctor)->getJson(route('api.patients.search', ['q' => 'a']))->assertForbidden();
        $this->actingAs($doctor)->getJson(route('api.patients.recent'))->assertForbidden();
        $this->actingAs($doctor)->getJson(route('api.patients.show', $patient->id))->assertForbidden();
        $this->change($patient, ['name' => 'Nope'], $doctor)->assertForbidden();

        $this->assertSame(2, Patient::query()->count());
    }

    public function test_nobody_signed_in_cannot_reach_patients()
    {
        $patient = Patient::factory()->forClinic($this->clinic)->create();

        $this->getJson(route('api.patients.search', ['q' => 'a']))->assertUnauthorized();
        $this->getJson(route('api.patients.recent'))->assertUnauthorized();
        $this->getJson(route('api.patients.show', $patient->id))->assertUnauthorized();
        $this->postJson(route('api.patients.store'), ['name' => 'X', 'phone' => '0300 1234567'])->assertUnauthorized();
        $this->patchJson(route('api.patients.update', $patient->id), ['name' => 'X'])->assertUnauthorized();
    }
}
