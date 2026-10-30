<?php

namespace Tests\Feature\Admin;

use App\Enums\Role;
use App\Exceptions\LastAdmin;
use App\Models\Clinic;
use App\Models\Doctor;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\StaffInvitation;
use App\Services\StaffService;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\AssertsShape;
use Tests\TestCase;

class StaffTest extends TestCase
{
    use AssertsShape, RefreshDatabase;

    private Clinic $clinic;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        config(['vocamed.real_auth' => true]);
        $this->clinic = Clinic::factory()->create(['name' => 'Alpha Clinic']);
        $this->admin = User::factory()->clinicAdmin()->forClinic($this->clinic)->create(['name' => 'Amina Alpha']);
    }

    private function invite(string $email = 'bilal@example.test', string $role = 'receptionist')
    {
        return $this->actingAs($this->admin)->postJson(route('admin.staff.invite'), ['email' => $email, 'role' => $role]);
    }

    private function staff(): array
    {
        return $this->actingAs($this->admin)->getJson(route('admin.staff'))->assertOk()->json('rows');
    }

    private function actions(): array
    {
        return DB::table('audit_logs')->orderBy('id')->pluck('action')->all();
    }

    /** The link in the email the invitation sent. */
    private function linkSentTo(string $email): string
    {
        $link = null;

        Notification::assertSentOnDemand(StaffInvitation::class, function (StaffInvitation $notification, array $channels, AnonymousNotifiable $notifiable) use ($email, &$link) {
            if ($notifiable->routes['mail'] === $email) {
                $link = $notification->toMail($notifiable)->actionUrl;
            }

            return true;
        });

        return (string) $link;
    }

    private function tokenOf(string $link): string
    {
        return basename($link);
    }

    // The list

    public function test_the_read_model_has_the_shape_the_screen_is_tested_with()
    {
        $view = $this->actingAs($this->admin)->getJson(route('admin.staff'))->assertOk()->json();

        $this->assertSameShape($this->fixture('admin-staff-view'), $view);
        $this->assertSame('Amina Alpha', $view['rows'][0]['name']);
        $this->assertTrue($view['rows'][0]['isYou']);
    }

    public function test_the_list_holds_receptionists_and_admins_and_waiting_invitations_but_not_doctors()
    {
        User::factory()->receptionist()->forClinic($this->clinic)->create(['name' => 'Bilal Beta']);
        User::factory()->doctor()->forClinic($this->clinic)->create(['name' => 'Dr. Hidden']);
        $this->invite('new@example.test')->assertCreated();
        Invitation::factory()->expired()->create(['clinic_id' => $this->clinic->id, 'email' => 'late@example.test']);
        Invitation::factory()->accepted()->create(['clinic_id' => $this->clinic->id, 'email' => 'done@example.test']);
        Invitation::factory()->revoked()->create(['clinic_id' => $this->clinic->id, 'email' => 'gone@example.test']);

        $rows = collect($this->staff());

        $this->assertSame(['Amina Alpha', 'Bilal Beta', null, null], $rows->pluck('name')->all());
        $this->assertSame(['new@example.test', 'late@example.test'], $rows->whereNull('name')->pluck('email')->values()->all());
        $this->assertSame(['invited', 'expired'], $rows->whereNull('name')->pluck('status')->values()->all());
    }

    public function test_the_server_decides_what_each_row_allows()
    {
        $other = User::factory()->clinicAdmin()->forClinic($this->clinic)->create(['name' => 'Zoya Admin']);
        $off = User::factory()->receptionist()->inactive()->forClinic($this->clinic)->create(['name' => 'Off Person']);
        $this->invite('new@example.test')->assertCreated();

        $rows = collect($this->staff())->keyBy(fn ($r) => $r['name'] ?? $r['email']);

        $this->assertFalse($rows['Amina Alpha']['allowed']['deactivate'], 'not yourself');
        $this->assertTrue($rows['Zoya Admin']['allowed']['deactivate']);
        $this->assertTrue($rows['Off Person']['allowed']['reactivate']);
        $this->assertFalse($rows['Off Person']['allowed']['deactivate']);
        $this->assertSame(['resend' => true, 'revoke' => true, 'deactivate' => false, 'reactivate' => false], $rows['new@example.test']['allowed']);

        $other->forceFill(['is_active' => false])->save();
        $lastAdmin = collect($this->staff())->firstWhere('name', 'Amina Alpha');
        $this->assertFalse($lastAdmin['allowed']['deactivate']);
        $this->assertSame('deactivated', collect($this->staff())->firstWhere('name', 'Zoya Admin')['status']);
        $this->assertSame('deactivated', $off->fresh()->is_active ? 'active' : 'deactivated');
    }

    // Inviting

    public function test_an_invitation_is_created_and_emailed_with_a_link_that_works()
    {
        Notification::fake();

        $created = $this->invite('Bilal@Example.test ', 'receptionist')->assertCreated()
            ->assertJson(['email' => 'bilal@example.test', 'role' => 'receptionist', 'doctorId' => null, 'status' => 'pending'])->json();

        $this->assertSameShape($this->fixture('invitation'), $created);
        $token = $this->tokenOf($this->linkSentTo('bilal@example.test'));

        $this->getJson(route('invitations.show', $token))->assertOk()->assertJson(['state' => 'valid', 'role' => 'receptionist', 'clinicName' => 'Alpha Clinic']);
        $this->assertNotSame($token, DB::table('invitations')->value('token_hash'), 'only the hash is stored');
    }

    public function test_the_invitation_email_reaches_the_developer_inbox_locally()
    {
        $this->invite('inbox@example.test')->assertCreated();

        $this->get(route('dev.inbox'))->assertOk()->assertSee('inbox@example.test')->assertSee('Alpha Clinic')->assertSee('/invite/', false);
    }

    public function test_the_person_who_accepts_signs_in_with_the_role_the_invitation_gave()
    {
        Notification::fake();
        $this->invite('rec@example.test', 'receptionist')->assertCreated();
        $token = $this->tokenOf($this->linkSentTo('rec@example.test'));

        $this->app['auth']->forgetGuards();
        $this->postJson(route('invitations.accept', $token), ['name' => 'Rida Rec', 'password' => 'a-good-password-1'])->assertOk();
        $this->postJson(route('login.store'), ['email' => 'rec@example.test', 'password' => 'a-good-password-1'])->assertOk()->assertJson(['role' => 'receptionist', 'home' => '/reception']);
    }

    public function test_inviting_is_audited_with_the_address_and_role()
    {
        $this->invite('audit@example.test', 'clinic_admin')->assertCreated();

        $this->assertSame(['user.invited'], $this->actions());
        $row = DB::table('audit_logs')->first();
        $this->assertSame(['email' => 'audit@example.test', 'role' => 'clinic_admin'], json_decode($row->meta, true));
        $this->assertSame((string) $this->admin->id, $row->actor_id);
    }

    public function test_an_address_with_an_account_anywhere_cannot_be_invited()
    {
        $elsewhere = User::factory()->clinicAdmin()->forClinic(Clinic::factory()->create())->create(['email' => 'taken@example.test']);

        $this->invite('taken@example.test')->assertStatus(422)->assertJsonPath('code', 'DUPLICATE_EMAIL')->assertJsonPath('field', 'email');
        $this->invite('TAKEN@example.test')->assertStatus(422)->assertJsonPath('code', 'DUPLICATE_EMAIL');
        $this->assertSame($elsewhere->email, 'taken@example.test');
        $this->assertSame(0, Invitation::query()->count());
    }

    public function test_an_address_with_a_waiting_invitation_cannot_be_invited_again_until_it_is_revoked_or_runs_out()
    {
        $id = $this->invite('wait@example.test')->assertCreated()->json('id');

        $this->invite('wait@example.test')->assertStatus(422)->assertJsonPath('code', 'DUPLICATE_EMAIL');

        $this->actingAs($this->admin)->deleteJson(route('admin.staff.revoke', $id))->assertOk();
        $this->invite('wait@example.test')->assertCreated();

        Invitation::query()->where('email', 'wait@example.test')->update(['expires_at' => now()->subMinute()]);
        $this->invite('wait@example.test')->assertCreated();
    }

    public function test_bad_input_is_refused_on_its_field()
    {
        $this->invite('not-an-email')->assertStatus(422)->assertJsonPath('field', 'email');
        $this->invite('ok@example.test', 'doctor')->assertStatus(422)->assertJsonPath('field', 'role');
        $this->invite('ok@example.test', 'owner')->assertStatus(422)->assertJsonPath('field', 'role');
        $this->assertSame(0, Invitation::query()->count());
    }

    // Resend and revoke

    public function test_resending_gives_a_fresh_link_and_the_old_one_stops_working()
    {
        Notification::fake();
        $id = $this->invite('again@example.test')->json('id');
        $old = $this->tokenOf($this->linkSentTo('again@example.test'));
        Invitation::query()->whereKey($id)->update(['expires_at' => now()->subDay()]);
        Notification::fake();

        $this->actingAs($this->admin)->postJson(route('admin.staff.resend', $id))->assertOk()->assertJson(['id' => $id, 'status' => 'pending']);
        $new = $this->tokenOf($this->linkSentTo('again@example.test'));

        $this->assertNotSame($old, $new);
        $this->getJson(route('invitations.show', $old))->assertJson(['state' => 'expired']);
        $this->getJson(route('invitations.show', $new))->assertJson(['state' => 'valid']);
        $this->assertContains('user.invitation_resent', $this->actions());
    }

    public function test_revoking_kills_the_link_and_removes_the_row()
    {
        Notification::fake();
        $id = $this->invite('revoke@example.test')->json('id');
        $token = $this->tokenOf($this->linkSentTo('revoke@example.test'));

        $this->actingAs($this->admin)->deleteJson(route('admin.staff.revoke', $id))->assertOk()->assertExactJson(['ok' => true]);

        $this->getJson(route('invitations.show', $token))->assertJson(['state' => 'expired']);
        $this->postJson(route('invitations.accept', $token), ['name' => 'X', 'password' => 'a-good-password-1'])->assertStatus(410);
        $this->assertSame(['Amina Alpha'], array_column($this->staff(), 'name'));
        $this->assertSame(['user.invited', 'user.revoked'], $this->actions());
    }

    public function test_an_accepted_invitation_can_be_neither_resent_nor_revoked()
    {
        $invitation = Invitation::factory()->accepted()->create(['clinic_id' => $this->clinic->id]);

        $this->actingAs($this->admin)->postJson(route('admin.staff.resend', $invitation->id))->assertStatus(410)->assertJsonPath('code', 'INVITATION_USED');
        $this->actingAs($this->admin)->deleteJson(route('admin.staff.revoke', $invitation->id))->assertStatus(410);
    }

    // Switching people off and on

    public function test_a_person_is_deactivated_signed_out_at_once_and_can_be_brought_back()
    {
        $rec = User::factory()->receptionist()->forClinic($this->clinic)->create(['email' => 'rec@example.test', 'password' => 'a-good-password-1']);
        DB::table('sessions')->insert(['id' => 'rec-device', 'user_id' => $rec->id, 'ip_address' => '1.2.3.4', 'user_agent' => 'x', 'payload' => '', 'last_activity' => time()]);
        config(['session.driver' => 'database']);

        $this->actingAs($this->admin)->patchJson(route('admin.staff.deactivate', $rec->id), ['active' => false])->assertOk()->assertJson(['id' => (string) $rec->id, 'active' => false, 'email' => 'rec@example.test', 'role' => 'receptionist']);

        $this->assertSame(0, DB::table('sessions')->where('user_id', $rec->id)->count());
        $this->app['auth']->forgetGuards();
        $this->postJson(route('login.store'), ['email' => 'rec@example.test', 'password' => 'a-good-password-1'])->assertStatus(422);

        $this->actingAs($this->admin)->patchJson(route('admin.staff.deactivate', $rec->id), ['active' => true])->assertOk()->assertJson(['active' => true]);
        $this->assertSame(['user.deactivated', 'user.reactivated'], $this->actions());
    }

    public function test_you_cannot_deactivate_yourself()
    {
        User::factory()->clinicAdmin()->forClinic($this->clinic)->create();

        $this->actingAs($this->admin)->patchJson(route('admin.staff.deactivate', $this->admin->id), ['active' => false])
            ->assertForbidden()->assertJsonPath('code', 'FORBIDDEN');
        $this->assertTrue($this->admin->fresh()->is_active);
    }

    public function test_the_last_active_admin_cannot_be_deactivated()
    {
        $second = User::factory()->clinicAdmin()->forClinic($this->clinic)->create();

        // Through the screen an admin always leaves themselves as another active admin, so the second goes without trouble.
        $this->actingAs($this->admin)->patchJson(route('admin.staff.deactivate', $second->id), ['active' => false])->assertOk();

        // The rule that protects the clinic when two admins switch each other off at the same moment: with the other already
        // gone, the service itself refuses to remove the one who is left, whoever asks.
        $someoneElse = User::factory()->receptionist()->forClinic($this->clinic)->create();

        $this->expectException(LastAdmin::class);
        app(TenantContext::class)->run($this->clinic, fn () => app(StaffService::class)->setActive($this->admin, false, $someoneElse));
    }

    public function test_the_last_admin_is_still_active_after_the_refusal()
    {
        $someoneElse = User::factory()->receptionist()->forClinic($this->clinic)->create();

        try {
            app(TenantContext::class)->run($this->clinic, fn () => app(StaffService::class)->setActive($this->admin, false, $someoneElse));
            $this->fail('The last admin was deactivated.');
        } catch (LastAdmin) {
        }

        $this->assertTrue($this->admin->fresh()->is_active);
        $this->assertSame([], $this->actions());
    }

    public function test_doctors_and_other_clinics_people_are_not_reachable_here()
    {
        $doctor = User::factory()->doctor()->forClinic($this->clinic)->create();
        $foreign = User::factory()->receptionist()->forClinic(Clinic::factory()->create())->create();

        $this->actingAs($this->admin)->patchJson(route('admin.staff.deactivate', $doctor->id), ['active' => false])->assertNotFound();
        $this->actingAs($this->admin)->patchJson(route('admin.staff.deactivate', $foreign->id), ['active' => false])->assertNotFound();
        $this->assertTrue($foreign->fresh()->is_active);
    }

    public function test_another_clinics_invitation_is_not_found()
    {
        $foreign = Invitation::factory()->create(['clinic_id' => Clinic::factory()->create()->id]);

        $this->actingAs($this->admin)->postJson(route('admin.staff.resend', $foreign->id))->assertNotFound();
        $this->actingAs($this->admin)->deleteJson(route('admin.staff.revoke', $foreign->id))->assertNotFound();
        $this->assertNull($foreign->fresh()->revoked_at);
    }

    // A doctor's sign-in

    public function test_a_doctor_is_invited_signs_in_and_is_linked_to_their_record()
    {
        Notification::fake();
        $doctor = Doctor::factory()->forClinic($this->clinic)->create(['display_name' => 'Dr. Sana']);

        $this->actingAs($this->admin)->postJson(route('admin.doctors.invite', $doctor->id), ['email' => 'sana@example.test'])
            ->assertCreated()->assertJson(['role' => 'doctor', 'doctorId' => $doctor->id, 'status' => 'pending']);

        $profile = $this->actingAs($this->admin)->getJson(route('admin.doctor', $doctor->id))->json('signIn');
        $this->assertSame('invited', $profile['state']);
        $this->assertSame('sana@example.test', $profile['email']);

        $token = $this->tokenOf($this->linkSentTo('sana@example.test'));
        $this->app['auth']->forgetGuards();
        $this->postJson(route('invitations.accept', $token), ['name' => 'Sana Malik', 'password' => 'a-good-password-1'])->assertOk();

        $user = User::query()->where('email', 'sana@example.test')->firstOrFail();
        $this->assertSame(Role::Doctor, $user->role);
        $this->assertSame($user->id, $doctor->fresh()->user_id);

        $this->postJson(route('login.store'), ['email' => 'sana@example.test', 'password' => 'a-good-password-1'])->assertOk()->assertJson(['role' => 'doctor']);
        $this->getJson(route('doctor.availability'))->assertOk()->assertJsonPath('doctor.name', 'Dr. Sana');

        $this->actingAs($this->admin)->getJson(route('admin.doctor', $doctor->id))->assertJsonPath('signIn.state', 'active')->assertJsonPath('signIn.email', 'sana@example.test');
    }

    public function test_inviting_a_doctor_again_replaces_the_waiting_invitation_even_for_another_address()
    {
        Notification::fake();
        $doctor = Doctor::factory()->forClinic($this->clinic)->create();

        $this->actingAs($this->admin)->postJson(route('admin.doctors.invite', $doctor->id), ['email' => 'one@example.test'])->assertCreated();
        $first = $this->tokenOf($this->linkSentTo('one@example.test'));
        $this->actingAs($this->admin)->postJson(route('admin.doctors.invite', $doctor->id), ['email' => 'two@example.test'])->assertCreated();

        $this->getJson(route('invitations.show', $first))->assertJson(['state' => 'expired']);
        $this->assertSame('two@example.test', $this->actingAs($this->admin)->getJson(route('admin.doctor', $doctor->id))->json('signIn.email'));
    }

    public function test_a_doctor_who_can_already_sign_in_cannot_be_invited()
    {
        $user = User::factory()->doctor()->forClinic($this->clinic)->create();
        $doctor = Doctor::factory()->forUser($user)->create();

        $this->actingAs($this->admin)->postJson(route('admin.doctors.invite', $doctor->id), ['email' => 'again@example.test'])
            ->assertStatus(422)->assertJsonPath('code', 'VALIDATION')->assertJsonPath('field', 'email');
    }

    public function test_a_doctor_invitation_for_a_doctor_linked_meanwhile_cannot_be_accepted()
    {
        $doctor = Doctor::factory()->forClinic($this->clinic)->create();
        Invitation::factory()->forDoctor($doctor)->withToken('doctor-link')->create(['email' => 'late@example.test']);
        $doctor->forceFill(['user_id' => User::factory()->doctor()->forClinic($this->clinic)->create()->id])->save();

        $this->postJson(route('invitations.accept', 'doctor-link'), ['name' => 'Late', 'password' => 'a-good-password-1'])->assertStatus(410);
        $this->assertSame(0, User::query()->where('email', 'late@example.test')->count());
    }

    public function test_another_clinics_doctor_cannot_be_invited()
    {
        $foreign = Doctor::factory()->forClinic(Clinic::factory()->create())->create();

        $this->actingAs($this->admin)->postJson(route('admin.doctors.invite', $foreign->id), ['email' => 'x@example.test'])->assertNotFound();
    }

    // Who may do this

    public function test_only_the_clinic_admin_may_manage_staff()
    {
        $invitation = Invitation::factory()->create(['clinic_id' => $this->clinic->id]);
        $target = User::factory()->receptionist()->forClinic($this->clinic)->create();

        foreach ([Role::Receptionist, Role::Doctor] as $role) {
            $user = User::factory()->forClinic($this->clinic)->create(['role' => $role]);

            $this->actingAs($user)->getJson(route('admin.staff'))->assertForbidden();
            $this->actingAs($user)->postJson(route('admin.staff.invite'), ['email' => 'x@example.test', 'role' => 'receptionist'])->assertForbidden();
            $this->actingAs($user)->postJson(route('admin.staff.resend', $invitation->id))->assertForbidden();
            $this->actingAs($user)->deleteJson(route('admin.staff.revoke', $invitation->id))->assertForbidden();
            $this->actingAs($user)->patchJson(route('admin.staff.deactivate', $target->id), ['active' => false])->assertForbidden();
        }

        $this->assertTrue($target->fresh()->is_active);
        $this->assertNull($invitation->fresh()->revoked_at);
        $this->assertTrue(Hash::check('password', $target->fresh()->password));
    }

    public function test_the_page_still_renders_for_a_browser()
    {
        $this->actingAs($this->admin)->get(route('admin.staff'))->assertOk()->assertInertia(fn ($page) => $page->component('admin/staff'));
    }
}
