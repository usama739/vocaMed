<?php

namespace Tests\Feature\Patients;

use App\Models\Clinic;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** A patient's optional email address: kept tidy, validated, encrypted at rest, and a third channel to be reached on. */
class PatientEmailTest extends TestCase
{
    use RefreshDatabase;

    private Clinic $clinic;

    private User $reception;

    protected function setUp(): void
    {
        parent::setUp();

        config(['vocamed.real_auth' => true]);
        $this->clinic = Clinic::factory()->create(['country' => 'PK']);
        $this->reception = User::factory()->receptionist()->forClinic($this->clinic)->create();
    }

    private function create(array $input)
    {
        return $this->actingAs($this->reception)->postJson(route('api.patients.store'), ['name' => 'Ayesha Khan', 'phone' => '0300 1234567', ...$input]);
    }

    private function change(string $id, array $patch)
    {
        return $this->actingAs($this->reception)->patchJson(route('api.patients.update', $id), $patch);
    }

    public function test_a_patient_has_no_email_unless_one_is_given()
    {
        $this->create([])->assertCreated()->assertJson(['email' => '']);
    }

    public function test_an_address_is_kept_trimmed_and_in_lower_case_and_can_be_changed_and_cleared()
    {
        $made = $this->create(['email' => '  Ayesha.Khan@Example.TEST ', 'preferredChannel' => 'email'])->assertCreated()
            ->assertJson(['email' => 'ayesha.khan@example.test', 'preferredChannel' => 'email'])->json();

        $this->change($made['id'], ['email' => 'new@example.test'])->assertOk()->assertJson(['email' => 'new@example.test']);
        $this->change($made['id'], ['email' => ''])->assertOk()->assertJson(['email' => '']);
        $this->change($made['id'], ['email' => null])->assertOk()->assertJson(['email' => '']);
        $this->change($made['id'], ['name' => 'Ayesha K.'])->assertOk();
    }

    public function test_a_bad_address_is_refused_on_the_email_field()
    {
        $this->create(['email' => 'not-an-address'])->assertStatus(422)->assertJson(['code' => 'VALIDATION', 'field' => 'email']);
        $this->create(['email' => str_repeat('a', 200).'@example.test'])->assertStatus(422)->assertJson(['field' => 'email']);

        $made = $this->create([])->assertCreated()->json();
        $this->change($made['id'], ['email' => 'nope'])->assertStatus(422)->assertJson(['field' => 'email']);
        $this->assertSame(0, Patient::query()->withoutGlobalScopes()->whereNotNull('email')->count());
    }

    public function test_the_address_is_encrypted_in_the_database_and_never_listed_in_the_history()
    {
        $made = $this->create(['email' => 'ayesha@example.test'])->assertCreated()->json();
        $this->change($made['id'], ['email' => 'other@example.test'])->assertOk();

        $raw = (string) DB::table('patients')->value('email');
        $this->assertStringNotContainsString('example.test', $raw);
        $this->assertSame('other@example.test', Patient::query()->withoutGlobalScopes()->first()->email);

        $audit = DB::table('audit_logs')->whereIn('action', ['patient.created', 'patient.updated'])->get();
        $this->assertStringContainsString('email', (string) $audit->firstWhere('action', 'patient.updated')->meta);
        $this->assertStringNotContainsString('example.test', $audit->pluck('meta')->implode(' '));
    }

    public function test_email_is_one_of_three_channels_and_nothing_else_is()
    {
        $made = $this->create([])->assertCreated()->json();

        foreach (['sms', 'whatsapp', 'email'] as $channel) {
            $this->change($made['id'], ['preferredChannel' => $channel])->assertOk()->assertJson(['preferredChannel' => $channel]);
        }

        $this->change($made['id'], ['preferredChannel' => 'pigeon'])->assertStatus(422);
    }
}
