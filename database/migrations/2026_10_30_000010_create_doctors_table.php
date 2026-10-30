<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * A doctor who can be booked. `user_id` links the doctor to a login once their invitation is accepted (a doctor
     * can be set up and booked before that). `doctor_service` says who offers what; it has no clinic_id because it is
     * only ever reached through a doctor and a service, which are both scoped to the clinic.
     */
    public function up(): void
    {
        Schema::create('doctors', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->unique()->constrained('users')->nullOnDelete();
            $table->string('display_name', 120);
            $table->string('specialty', 120)->default('');
            $table->json('languages');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['clinic_id', 'is_active']);
        });

        Schema::create('doctor_service', function (Blueprint $table) {
            $table->foreignUlid('doctor_id')->constrained('doctors')->cascadeOnDelete();
            $table->foreignUlid('service_id')->constrained('services')->cascadeOnDelete();

            $table->primary(['doctor_id', 'service_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('doctor_service');
        Schema::dropIfExists('doctors');
    }
};
