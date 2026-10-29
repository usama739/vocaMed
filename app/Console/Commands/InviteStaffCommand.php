<?php

namespace App\Console\Commands;

use App\Enums\Role;
use App\Exceptions\DuplicateEmail;
use App\Models\Clinic;
use App\Services\InvitationService;
use Illuminate\Console\Command;
use Illuminate\Validation\Rule;

use function Laravel\Prompts\select;
use function Laravel\Prompts\text;

class InviteStaffCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'clinic:invite
        {--clinic= : The clinic id}
        {--email= : The address to invite}
        {--role= : clinic_admin, receptionist or doctor}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Invite someone to a clinic and print the link (shown once)';

    public function handle(InvitationService $invitations): int
    {
        $clinic = Clinic::query()->find($this->option('clinic') ?: text('Clinic id', required: true));

        if ($clinic === null) {
            $this->components->error('There is no clinic with that id.');

            return self::FAILURE;
        }

        $email = strtolower(trim((string) ($this->option('email') ?: text('Email address', required: true))));
        $role = $this->option('role') ?: select('Role', array_column(Role::cases(), 'value'));

        $validator = validator(
            ['email' => $email, 'role' => $role],
            ['email' => ['required', 'email', 'max:255'], 'role' => ['required', Rule::enum(Role::class)]],
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->components->error($message);
            }

            return self::FAILURE;
        }

        try {
            [, $token] = $invitations->issue($clinic, $email, Role::from((string) $role));
        } catch (DuplicateEmail) {
            $this->components->error('That address already has an account.');

            return self::FAILURE;
        }

        $this->components->info('Invitation created. It works for '.config('vocamed.invitation_days').' days; this link is shown only once:');
        $this->line(url("/invite/{$token}"));

        return self::SUCCESS;
    }
}
