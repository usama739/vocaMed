<?php

namespace Tests\Feature\Live;

use App\Models\Appointment;
use Illuminate\Broadcasting\Broadcasters\Broadcaster;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Tests\Concerns\BuildsBookingWorld;
use Tests\TestCase;

/** A stopped or broken socket server must never break the booking it was going to announce. */
class LiveUpdatesFailureTest extends TestCase
{
    use BuildsBookingWorld, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildBookingWorld();

        // The queue is `sync` in tests, so the broadcast runs inside the request, and this broadcaster always fails.
        Broadcast::extend('failing', fn () => new class extends Broadcaster
        {
            public function auth($request): mixed
            {
                return null;
            }

            public function validAuthenticationResponse($request, $result): mixed
            {
                return null;
            }

            public function broadcast(array $channels, $event, array $payload = []): void
            {
                throw new RuntimeException('the socket server is down');
            }
        });

        config(['broadcasting.default' => 'failing', 'broadcasting.connections.failing' => ['driver' => 'failing']]);
    }

    protected function tearDown(): void
    {
        $this->tearDownBookingWorld();

        parent::tearDown();
    }

    public function test_a_booking_still_succeeds_and_is_saved_when_the_socket_server_is_down()
    {
        Log::spy();

        $id = $this->actingAs($this->reception)->postJson(route('api.appointments.store'), [
            'patientId' => $this->patient->id, 'doctorId' => $this->doctor->id, 'serviceId' => $this->service->id,
            'startsAt' => $this->at('2026-11-02 09:00')->toIso8601String(),
        ])->assertCreated()->json('id');

        $this->assertNotNull(Appointment::query()->find($id));
        // It was reported, not swallowed silently.
        Log::shouldHaveReceived('error')->atLeast()->once();
    }
}
