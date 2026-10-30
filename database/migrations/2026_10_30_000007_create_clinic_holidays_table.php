<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Clinic-wide closures. A date is clinic-local (no time), and a clinic closes on a date at most once.
     */
    public function up(): void
    {
        Schema::create('clinic_holidays', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->date('date');
            $table->string('name', 120);
            $table->timestamps();

            $table->unique(['clinic_id', 'date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('clinic_holidays');
    }
};
