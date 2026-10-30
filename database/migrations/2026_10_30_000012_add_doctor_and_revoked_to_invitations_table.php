<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * A doctor's sign-in invitation carries the doctor it is for, so accepting it links the new login to that doctor. A
     * revoked invitation is kept (the audit log refers to it) but its link no longer works.
     */
    public function up(): void
    {
        Schema::table('invitations', function (Blueprint $table) {
            $table->foreignUlid('doctor_id')->nullable()->constrained('doctors')->nullOnDelete();
            $table->timestamp('revoked_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('invitations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('doctor_id');
            $table->dropColumn('revoked_at');
        });
    }
};
