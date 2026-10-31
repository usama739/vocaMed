<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * `patients.email` is optional (encrypted at rest) and lets a patient be reached by email. `messages` is the log of what the
     * clinic has sent, or tried to send, to patients: one row per message, filed once (the unique `dedupe_key`), so a retry or a
     * second scheduler tick can never send it twice. A failed row is never edited into a success: sending it again files a new row
     * and stamps `resent_at` on the old one.
     */
    public function up(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $table->text('email')->nullable()->after('phone');
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->foreignUlid('appointment_id')->constrained('appointments')->cascadeOnDelete();
            $table->foreignUlid('patient_id')->constrained('patients')->restrictOnDelete();
            $table->string('kind', 20);
            $table->string('channel', 20);
            $table->string('status', 20);
            $table->string('failure_reason', 30)->nullable();
            $table->string('dedupe_key', 160)->unique();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('resent_at')->nullable();
            $table->timestamps();

            $table->index(['clinic_id', 'created_at']);
            $table->index('appointment_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('messages');

        Schema::table('patients', function (Blueprint $table) {
            $table->dropColumn('email');
        });
    }
};
