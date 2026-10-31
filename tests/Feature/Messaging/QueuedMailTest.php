<?php

namespace Tests\Feature\Messaging;

use App\Enums\Role;
use App\Models\Clinic;
use App\Models\User;
use App\Notifications\ConfirmClinicEmail;
use App\Notifications\QueuedResetPassword;
use App\Notifications\StaffInvitation;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\SendQueuedNotifications;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/** The emails staff get (sign-up confirmation, invitations, forgot password) go through the queue, so a slow mail server never holds a page up. */
class QueuedMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_three_staff_emails_are_queued_notifications()
    {
        $this->assertInstanceOf(ShouldQueue::class, new ConfirmClinicEmail);
        $this->assertInstanceOf(ShouldQueue::class, new StaffInvitation('Clinic', Role::Receptionist, 'https://example.test/invite/x'));
        $this->assertInstanceOf(ShouldQueue::class, new QueuedResetPassword('token'));
    }

    public function test_asking_for_a_password_reset_queues_the_email()
    {
        Queue::fake();
        $user = User::factory()->clinicAdmin()->forClinic(Clinic::factory()->create())->create();

        $this->postJson(route('password.email'), ['email' => $user->email])->assertOk();

        Queue::assertPushed(SendQueuedNotifications::class, fn (SendQueuedNotifications $job) => $job->notification instanceof QueuedResetPassword);
    }

    public function test_inviting_staff_queues_the_invitation()
    {
        Queue::fake();
        config(['vocamed.real_auth' => true]);
        $clinic = Clinic::factory()->create();
        $admin = User::factory()->clinicAdmin()->forClinic($clinic)->create();

        $this->actingAs($admin)->postJson(route('admin.staff.invite'), ['email' => 'new@example.test', 'role' => 'receptionist'])->assertCreated();

        Queue::assertPushed(SendQueuedNotifications::class, fn (SendQueuedNotifications $job) => $job->notification instanceof StaffInvitation);
    }

    public function test_signing_up_queues_the_confirmation_and_the_queued_email_still_reaches_the_dev_inbox_when_it_runs()
    {
        config(['vocamed.self_service_signup' => true]);

        $this->postJson(route('register.store'), ['clinic' => 'New Clinic', 'country' => 'PK', 'timezone' => 'Asia/Karachi', 'name' => 'Amina Alpha', 'email' => 'amina@example.test', 'password' => 'a-good-password-1'])->assertOk();

        // With the sync queue of the tests the job has already run: the email is in the developer inbox.
        $this->assertStringContainsString('amina@example.test', (string) $this->get('/dev/inbox')->getContent());
    }
}
