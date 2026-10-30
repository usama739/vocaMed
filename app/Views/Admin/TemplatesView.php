<?php

namespace App\Views\Admin;

use App\Models\Clinic;
use App\Services\TemplateCatalog;
use App\Views\ClinicView;

/** `AdminTemplatesView`: the sixteen messages (kinds × channels × languages), the placeholders and the preview values. */
final class TemplatesView
{
    public function __construct(private readonly TemplateCatalog $templates) {}

    /**
     * @return array<string, mixed>
     */
    public function of(Clinic $clinic): array
    {
        return [
            'clinic' => ClinicView::of($clinic),
            'templates' => $this->templates->all(),
            'variables' => array_values((array) config('templates.variables')),
            'sample' => config('templates.sample'),
        ];
    }
}
