<?php

namespace Tests\Feature\Tenancy;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The build fails if clinic data can be read without the clinic filter: a model whose table has a `clinic_id` but
 * does not use `BelongsToClinic`, a clinic table no model covers (raw queries only), or code that switches the
 * scope off by hand instead of through `TenantContext::bypass()`.
 */
class EveryClinicModelIsScopedTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Models that have a clinic_id and are deliberately not scoped, with the reason. Adding to this list is a design
     * decision: say why.
     *
     * @var array<class-string<Model>, string>
     */
    private const UNSCOPED = [
        User::class => 'Read before a clinic is known (sign-in, password reset, invitation accept); staff lists use User::inCurrentClinic().',
    ];

    /**
     * @return list<class-string<Model>>
     */
    private function models(): array
    {
        $classes = [];

        foreach (File::files(app_path('Models')) as $file) {
            $class = 'App\\Models\\'.$file->getFilenameWithoutExtension();

            if (is_subclass_of($class, Model::class)) {
                $classes[] = $class;
            }
        }

        return $classes;
    }

    public function test_every_model_with_a_clinic_id_is_scoped_or_listed_with_a_reason()
    {
        $unguarded = [];

        foreach ($this->models() as $class) {
            $table = (new $class)->getTable();

            if (Schema::hasColumn($table, 'clinic_id')
                && ! in_array(BelongsToClinic::class, class_uses_recursive($class), true)
                && ! array_key_exists($class, self::UNSCOPED)) {
                $unguarded[] = $class;
            }
        }

        $this->assertSame([], $unguarded, 'These models have a clinic_id but do not use BelongsToClinic: '.implode(', ', $unguarded));
    }

    public function test_every_table_with_a_clinic_id_belongs_to_a_model()
    {
        $covered = array_map(fn (string $class) => (new $class)->getTable(), $this->models());
        $orphans = [];

        foreach (Schema::getTables() as $table) {
            if (Schema::hasColumn($table['name'], 'clinic_id') && ! in_array($table['name'], $covered, true)) {
                $orphans[] = $table['name'];
            }
        }

        $this->assertSame([], $orphans, 'These tables have a clinic_id but no model, so nothing scopes them: '.implode(', ', $orphans));
    }

    public function test_the_unscoped_list_only_names_real_models_with_a_clinic_id()
    {
        foreach (array_keys(self::UNSCOPED) as $class) {
            $this->assertTrue(Schema::hasColumn((new $class)->getTable(), 'clinic_id'), "$class no longer needs an exemption.");
        }
    }

    public function test_no_code_switches_the_clinic_scope_off_by_hand()
    {
        $offenders = [];

        foreach (File::allFiles(app_path()) as $file) {
            $source = $file->getContents();

            if (preg_match('/withoutGlobalScope|withoutGlobalScopes/', $source) === 1) {
                $offenders[] = $file->getRelativePathname();
            }
        }

        $this->assertSame([], $offenders, 'Use TenantContext::bypass() instead of withoutGlobalScope(s): '.implode(', ', $offenders));
    }
}
