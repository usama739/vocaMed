<?php

namespace Tests\Feature\Tenancy;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\Invitation;
use App\Models\User;
use App\Services\InvitationService;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/** What a signed-in person can and cannot reach of another clinic, through real requests. */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    private Clinic $a;

    private Clinic $b;

    private User $adminA;

    private User $adminB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->a = Clinic::factory()->create(['name' => 'Clinic A']);
        $this->b = Clinic::factory()->create(['name' => 'Clinic B']);
        $this->adminA = User::factory()->clinicAdmin()->forClinic($this->a)->create();
        $this->adminB = User::factory()->clinicAdmin()->forClinic($this->b)->create();

        // Stand-ins for the module routes to come: a record fetched by URL and a list.
        Route::middleware('web')->group(function () {
            Route::get('/_tenant/whoami', fn () => response()->json(['clinic' => app(TenantContext::class)->id()]));
            Route::get('/_tenant/invitations/{invitation}', fn (Invitation $invitation) => response()->json(['email' => $invitation->email]));
            Route::get('/_tenant/invitations', fn () => response()->json(Invitation::query()->orderBy('email')->pluck('email')));
        });
    }

    public function test_the_signed_in_persons_clinic_is_the_one_acted_for()
    {
        $this->actingAs($this->adminA)->getJson('/_tenant/whoami')->assertExactJson(['clinic' => $this->a->id]);
        $this->actingAs($this->adminB)->getJson('/_tenant/whoami')->assertExactJson(['clinic' => $this->b->id]);
    }

    public function test_nobody_signed_in_means_no_clinic()
    {
        $this->getJson('/_tenant/whoami')->assertExactJson(['clinic' => null]);
    }

    public function test_the_clinic_cannot_be_chosen_by_the_request()
    {
        $this->actingAs($this->adminA)
            ->getJson('/_tenant/whoami?clinic_id='.$this->b->id, ['X-Clinic' => $this->b->id])
            ->assertExactJson(['clinic' => $this->a->id]);
    }

    public function test_a_list_shows_only_the_signed_in_persons_clinic()
    {
        Invitation::factory()->create(['clinic_id' => $this->a->id, 'email' => 'for-a@example.test']);
        Invitation::factory()->create(['clinic_id' => $this->b->id, 'email' => 'for-b@example.test']);

        $this->actingAs($this->adminA)->getJson('/_tenant/invitations')->assertExactJson(['for-a@example.test']);
        $this->actingAs($this->adminB)->getJson('/_tenant/invitations')->assertExactJson(['for-b@example.test']);
    }

    public function test_a_record_in_the_url_is_found_for_its_own_clinic_and_not_found_for_another()
    {
        $mine = Invitation::factory()->create(['clinic_id' => $this->a->id, 'email' => 'for-a@example.test']);
        $theirs = Invitation::factory()->create(['clinic_id' => $this->b->id, 'email' => 'for-b@example.test']);

        $this->actingAs($this->adminA)->getJson('/_tenant/invitations/'.$mine->id)->assertOk()->assertJson(['email' => 'for-a@example.test']);
        $this->actingAs($this->adminA)->getJson('/_tenant/invitations/'.$theirs->id)->assertNotFound()->assertJsonPath('code', 'NOT_FOUND');
    }

    public function test_the_context_does_not_leak_from_one_request_to_the_next()
    {
        $this->actingAs($this->adminA)->getJson('/_tenant/whoami')->assertExactJson(['clinic' => $this->a->id]);

        $this->app['auth']->forgetGuards();
        $this->getJson('/_tenant/whoami')->assertExactJson(['clinic' => null]);
    }

    public function test_the_invitation_link_still_opens_with_nobody_signed_in()
    {
        [, $token] = app(InvitationService::class)->issue($this->a, 'new@example.test', Role::Doctor);

        $this->getJson(route('invitations.show', $token))->assertOk()->assertJsonPath('state', 'valid')->assertJsonPath('clinicName', 'Clinic A');
    }
}
