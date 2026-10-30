<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * A clinic's patients. Name and phone stay plain because they are searched; notes are encrypted by the model. The phone
     * is in international form, or NULL for a walk-in added with a name only, and is unique within a clinic (several NULLs are
     * allowed). The index is what stops two receptionists adding the same number at the same moment.
     */
    public function up(): void
    {
        Schema::create('patients', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('phone', 20)->nullable();
            $table->string('preferred_locale', 5)->default('en');
            $table->string('preferred_channel', 20)->default('sms');
            $table->timestamp('consent_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['clinic_id', 'phone']);
            $table->index(['clinic_id', 'name']);
            $table->index(['clinic_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('patients');
    }
};
