<?php

namespace App\Console\Commands;

use App\Data\NewClinic;
use App\Services\ClinicService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

use function Laravel\Prompts\password;
use function Laravel\Prompts\text;

class CreateClinicCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'clinic:create
        {--name= : The clinic name}
        {--country=PK : Two-letter country code}
        {--timezone=Asia/Karachi : The clinic timezone}
        {--locale=en : Default language (en or ur)}
        {--admin-name= : The first admin\'s name}
        {--admin-email= : The first admin\'s email}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Open a clinic and create its first admin';

    public function handle(ClinicService $clinics): int
    {
        // Anything not given as an option is asked for. The password is only ever asked for, never
        // taken as an option, so it does not end up in shell history.
        $input = [
            'clinic' => $this->option('name') ?: text('Clinic name', required: true),
            'country' => $this->option('country'),
            'timezone' => $this->option('timezone'),
            'locale' => $this->option('locale'),
            'name' => $this->option('admin-name') ?: text('Admin name', required: true),
            'email' => $this->option('admin-email') ?: text('Admin email', required: true),
            'password' => password('Admin password', required: true),
        ];

        $validator = Validator::make($input, NewClinic::rules());

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->components->error($message);
            }

            return self::FAILURE;
        }

        $admin = $clinics->create(NewClinic::fromValidated($input));

        $this->components->info("Created {$admin->clinic?->name} ({$admin->clinic?->id}) with admin {$admin->email}.");

        return self::SUCCESS;
    }
}
