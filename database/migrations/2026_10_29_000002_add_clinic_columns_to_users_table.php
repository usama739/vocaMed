<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * clinic_id and role are nullable only so this can run on a table that already has rows; the
     * clinic service and the factory always set both, and a user without them cannot sign in.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignUlid('clinic_id')->nullable()->constrained('clinics')->restrictOnDelete();
            $table->string('role', 20)->nullable();
            $table->string('locale', 5)->default('en');
            $table->boolean('is_active')->default(true);

            $table->index(['clinic_id', 'role']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['clinic_id', 'role']);
            $table->dropConstrainedForeignId('clinic_id');
            $table->dropColumn(['role', 'locale', 'is_active']);
        });
    }
};
