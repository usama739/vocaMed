<?php

namespace Tests\Feature;

use App\Exceptions\DomainException;
use App\Models\Clinic;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class JsonErrorMapperTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware('web')->prefix('_errors')->group(function () {
            Route::get('domain', fn () => throw new class('That time was just taken.') extends DomainException
            {
                public function errorCode(): string
                {
                    return 'SLOT_UNAVAILABLE';
                }

                public function status(): int
                {
                    return 409;
                }

                public function field(): ?string
                {
                    return 'time';
                }

                public function extra(): array
                {
                    return ['alternatives' => [['time' => '10:30']]];
                }
            });
            Route::post('validate', fn () => throw ValidationException::withMessages([
                'phone' => ['The phone is not valid.'],
                'name' => ['The name is required.'],
            ]));
            Route::get('forbidden', fn () => abort(403));
            Route::get('missing-model', fn () => Clinic::query()->findOrFail('nope'));
            Route::get('limited', fn () => abort(429));
            Route::get('boom', fn () => throw new \RuntimeException('Unexpected'));
            Route::middleware('auth')->get('private', fn () => 'secret');
        });
    }

    public function test_a_domain_error_carries_its_code_status_field_and_extras(): void
    {
        $this->getJson('/_errors/domain')
            ->assertStatus(409)
            ->assertExactJson([
                'alternatives' => [['time' => '10:30']],
                'code' => 'SLOT_UNAVAILABLE',
                'message' => 'That time was just taken.',
                'field' => 'time',
                'detail' => null,
            ]);
    }

    public function test_validation_failures_name_the_first_field_and_list_all(): void
    {
        $this->postJson('/_errors/validate')
            ->assertStatus(422)
            ->assertJsonPath('code', 'VALIDATION')
            ->assertJsonPath('field', 'phone')
            ->assertJsonPath('errors.name.0', 'The name is required.');
    }

    public function test_access_and_lookup_failures_use_the_contract_codes(): void
    {
        $this->getJson('/_errors/forbidden')->assertStatus(403)->assertJsonPath('code', 'FORBIDDEN');
        $this->getJson('/_errors/missing-model')->assertStatus(404)->assertJsonPath('code', 'NOT_FOUND');
        $this->getJson('/_errors/nowhere')->assertStatus(404)->assertJsonPath('code', 'NOT_FOUND');
        $this->getJson('/_errors/limited')->assertStatus(429)->assertJsonPath('code', 'RATE_LIMITED');
        $this->getJson('/_errors/private')->assertStatus(401)->assertJsonPath('code', 'UNAUTHENTICATED');
    }

    public function test_a_real_bug_is_still_a_server_error_not_a_masked_contract_code(): void
    {
        $this->getJson('/_errors/boom')
            ->assertStatus(500)
            ->assertJsonMissingPath('code');
    }

    public function test_page_visits_keep_the_normal_redirect_with_errors(): void
    {
        $this->from('/somewhere')
            ->post('/_errors/validate', [], ['X-Inertia' => 'true'])
            ->assertRedirect('/somewhere')
            ->assertSessionHasErrors(['phone', 'name']);
    }
}
