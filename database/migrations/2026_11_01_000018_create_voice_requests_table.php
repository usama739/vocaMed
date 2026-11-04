<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * One row per spoken or typed booking request, from the moment it is accepted until its draft is ready (or it failed). The
     * transcript and the parsed fields hold patient names and phone numbers, so they are encrypted at rest (like `patients.email`)
     * and the model casts them. The recording itself is never in the database: `audio_path` points to an encrypted file on private
     * disk and is cleared, with `purged_at` stamped, as soon as the file is deleted. `duration_seconds` is what the browser said it
     * recorded (rounded up), kept so use can be traced per clinic.
     */
    public function up(): void
    {
        Schema::create('voice_requests', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('source', 10);
            $table->string('status', 20);
            $table->string('audio_path')->nullable();
            $table->string('audio_mime', 60)->nullable();
            $table->unsignedSmallInteger('duration_seconds')->nullable();
            $table->text('transcript')->nullable();
            $table->text('parsed_json')->nullable();
            $table->string('failure_code', 30)->nullable();
            $table->timestamp('purged_at')->nullable();
            $table->timestamps();

            $table->index(['clinic_id', 'created_at']);
            $table->index(['user_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('voice_requests');
    }
};
