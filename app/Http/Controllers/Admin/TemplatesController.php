<?php

namespace App\Http\Controllers\Admin;

use App\Authorization\Ability;
use App\Exceptions\InvalidPhone;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\TemplateKeyRequest;
use App\Models\Clinic;
use App\Services\TemplateCatalog;
use App\Support\PhoneNumber;
use App\Views\Admin\TemplatesView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

/** D7: the wording of the messages patients receive. */
class TemplatesController extends Controller
{
    public function __construct(private readonly TemplateCatalog $templates) {}

    public function index(Request $request, TemplatesView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('admin/templates');
        }

        Gate::authorize(Ability::ManageClinicSetup->value);

        return response()->json($view->of($this->clinic($request)));
    }

    public function update(TemplateKeyRequest $request): JsonResponse
    {
        Gate::authorize(Ability::ManageClinicSetup->value);

        $this->templates->save($request->string('kind')->toString(), $request->string('channel')->toString(), $request->string('locale')->toString(), $request->string('body')->toString());

        return response()->json(['ok' => true]);
    }

    public function destroy(TemplateKeyRequest $request): JsonResponse
    {
        Gate::authorize(Ability::ManageClinicSetup->value);

        $this->templates->reset($request->string('kind')->toString(), $request->string('channel')->toString(), $request->string('locale')->toString());

        return response()->json(['ok' => true]);
    }

    /**
     * Send the message, filled with sample details, to one phone. Until messages are delivered (the messages step) this
     * checks the text and the number and writes the message to the log instead, and says who it would go to.
     */
    public function test(TemplateKeyRequest $request): JsonResponse
    {
        Gate::authorize(Ability::ManageClinicSetup->value);

        $clinic = $this->clinic($request);
        $body = $this->templates->checked($request->string('body')->toString());
        $phone = PhoneNumber::normalize($request->string('phone')->toString(), $clinic->callingCode()) ?? throw new InvalidPhone;

        $sample = (array) config('templates.sample.'.$request->string('locale')->toString());
        $text = strtr($body, array_combine(array_map(fn (string $name) => '{'.$name.'}', array_keys($sample)), array_values($sample)));
        Log::info('Template test message (not delivered until the messages step)', ['to' => $phone, 'text' => $text]);

        return response()->json(['sentTo' => $phone]);
    }

    private function clinic(Request $request): Clinic
    {
        /** @var Clinic */
        return $request->user()->clinic;
    }
}
