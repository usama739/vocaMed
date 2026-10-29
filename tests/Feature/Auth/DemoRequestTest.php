<?php

namespace Tests\Feature\Auth;

use App\Models\DemoRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DemoRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_demo_request_is_kept_for_the_team_to_follow_up()
    {
        $this->postJson(route('demo-requests.store'), ['name' => 'Dr. Ali', 'clinic' => 'Noor Clinic', 'contact' => '+923001234567'])
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertDatabaseHas('demo_requests', ['name' => 'Dr. Ali', 'clinic' => 'Noor Clinic', 'contact' => '+923001234567']);
    }

    public function test_every_field_is_required()
    {
        $this->postJson(route('demo-requests.store'), ['name' => 'Dr. Ali'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['clinic', 'contact']);

        $this->assertSame(0, DemoRequest::query()->count());
    }

    public function test_each_throttled_route_keeps_its_own_count()
    {
        $input = ['name' => 'Dr. Ali', 'clinic' => 'Noor Clinic', 'contact' => 'ali@example.test'];

        // Use up the demo-request allowance; other public routes must not feel it (an unnamed throttle
        // would share one counter per network address across every route that uses it).
        for ($i = 0; $i < 5; $i++) {
            $this->postJson(route('demo-requests.store'), $input)->assertOk();
        }

        $this->getJson(route('invitations.show', 'any-token'))->assertOk();
        $this->getJson(route('password.status', ['token' => 'any', 'email' => 'a@example.test']))->assertOk();
        $this->postJson(route('register.store'), [])->assertStatus(422);
        $this->postJson(route('demo-requests.store'), $input)->assertStatus(429);
    }

    public function test_requests_are_limited_per_minute()
    {
        $input = ['name' => 'Dr. Ali', 'clinic' => 'Noor Clinic', 'contact' => 'ali@example.test'];

        for ($i = 0; $i < 5; $i++) {
            $this->postJson(route('demo-requests.store'), $input)->assertOk();
        }

        $this->postJson(route('demo-requests.store'), $input)->assertStatus(429)->assertJsonPath('code', 'RATE_LIMITED');
    }
}
