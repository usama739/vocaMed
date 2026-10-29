<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Someone asked for a demo on the landing page.
 *
 * @property string $id
 * @property string $name
 * @property string $clinic
 * @property string $contact
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable(['name', 'clinic', 'contact'])]
class DemoRequest extends Model
{
    use HasUlids;
}
