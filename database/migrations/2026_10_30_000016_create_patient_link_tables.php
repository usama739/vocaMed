<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * `patient_links` hold only the SHA-256 hash of a link's token (the token itself is shown once and cannot be recovered).
     * `reschedule_requests` are the moves a patient asked for when the clinic approves changes. `patient_replies` are what the
     * patient did through their link, for the appointment's timeline.
     */
    public function up(): void
    {
        Schema::create('patient_links', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->foreignUlid('appointment_id')->constrained('appointments')->cascadeOnDelete();
            $table->string('token_hash', 64)->unique();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index('appointment_id');
        });

        Schema::create('reschedule_requests', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->foreignUlid('appointment_id')->constrained('appointments')->cascadeOnDelete();
            $table->foreignUlid('patient_id')->constrained('patients')->restrictOnDelete();
            $table->foreignUlid('doctor_id')->constrained('doctors')->restrictOnDelete();
            $table->timestamp('from_starts_at');
            $table->timestamp('proposed_starts_at');
            $table->string('status', 20)->default('pending');
            $table->text('message')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->string('decided_by', 40)->nullable();
            $table->timestamps();

            $table->index(['doctor_id', 'status']);
            $table->index('appointment_id');
        });

        Schema::create('patient_replies', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->foreignUlid('appointment_id')->constrained('appointments')->cascadeOnDelete();
            $table->foreignUlid('patient_id')->constrained('patients')->restrictOnDelete();
            $table->string('action', 20);
            $table->timestamp('created_at');

            $table->index('appointment_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('patient_replies');
        Schema::dropIfExists('reschedule_requests');
        Schema::dropIfExists('patient_links');
    }
};
