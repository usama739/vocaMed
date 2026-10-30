<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * A doctor's weekly hours, leave and closed half hours. Times are "HH:MM" clinic-local; dates are clinic-local days.
     * A lunch break is the gap between two working rows of the same weekday.
     */
    public function up(): void
    {
        Schema::create('schedule_rules', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->foreignUlid('doctor_id')->constrained('doctors')->cascadeOnDelete();
            $table->unsignedTinyInteger('weekday');
            $table->string('start_time', 5);
            $table->string('end_time', 5);
            $table->timestamps();

            $table->index(['doctor_id', 'weekday']);
        });

        Schema::create('time_offs', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->foreignUlid('doctor_id')->constrained('doctors')->cascadeOnDelete();
            $table->date('start_date');
            $table->date('end_date');
            $table->string('reason', 255)->default('');
            $table->timestamps();

            $table->index(['doctor_id', 'start_date']);
        });

        Schema::create('blocked_slots', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->foreignUlid('doctor_id')->constrained('doctors')->cascadeOnDelete();
            $table->unsignedTinyInteger('weekday');
            $table->string('time', 5);
            $table->timestamps();

            $table->unique(['doctor_id', 'weekday', 'time']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('blocked_slots');
        Schema::dropIfExists('time_offs');
        Schema::dropIfExists('schedule_rules');
    }
};
