<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * `appointments` are the bookings. `appointment_slots` is the second layer of the no-double-booking guard: one row per
     * 5-minute cell of a doctor's time that an active appointment (and the buffer after it) occupies, with a unique index on
     * (doctor, cell), so the database itself refuses an overlap even if some code path forgot to check. It has no clinic_id:
     * it is only reached through an appointment and a doctor, which are scoped to the clinic.
     */
    public function up(): void
    {
        Schema::create('appointments', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->foreignUlid('doctor_id')->constrained('doctors')->restrictOnDelete();
            $table->foreignUlid('patient_id')->constrained('patients')->restrictOnDelete();
            $table->foreignUlid('service_id')->constrained('services')->restrictOnDelete();
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->string('status', 20);
            $table->string('source', 20);
            $table->text('reason')->nullable();
            $table->text('notes')->nullable();
            $table->string('created_by', 40)->nullable();
            $table->timestamps();

            $table->index(['clinic_id', 'starts_at']);
            $table->index(['doctor_id', 'starts_at']);
            $table->index(['patient_id', 'starts_at']);
            $table->index(['clinic_id', 'status']);
        });

        Schema::create('appointment_slots', function (Blueprint $table) {
            $table->foreignUlid('appointment_id')->constrained('appointments')->cascadeOnDelete();
            $table->foreignUlid('doctor_id')->constrained('doctors')->cascadeOnDelete();
            $table->timestamp('cell_start');

            $table->primary(['doctor_id', 'cell_start']);
            $table->index('appointment_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('appointment_slots');
        Schema::dropIfExists('appointments');
    }
};
