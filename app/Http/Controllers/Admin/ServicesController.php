<?php

namespace App\Http\Controllers\Admin;

use App\Authorization\Ability;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveServiceRequest;
use App\Models\Clinic;
use App\Models\Service;
use App\Services\ServiceCatalog;
use App\Views\Admin\ServicesView;
use App\Views\ServiceView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/** D5: what can be booked and who offers it. */
class ServicesController extends Controller
{
    public function __construct(private readonly ServiceCatalog $catalog) {}

    public function index(Request $request): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('admin/services');
        }

        Gate::authorize(Ability::ManageClinicSetup->value);

        /** @var Clinic $clinic */
        $clinic = $request->user()->clinic;

        return response()->json(ServicesView::of($clinic));
    }

    public function store(SaveServiceRequest $request): JsonResponse
    {
        Gate::authorize(Ability::ManageClinicSetup->value);

        return response()->json(ServiceView::of($this->catalog->create($request->validated())), 201);
    }

    public function update(SaveServiceRequest $request, Service $service): JsonResponse
    {
        Gate::authorize(Ability::ManageClinicSetup->value);

        return response()->json(ServiceView::of($this->catalog->update($service, $request->validated())));
    }

    /** `PATCH`: turn a service on or off. */
    public function toggle(Request $request, Service $service): JsonResponse
    {
        Gate::authorize(Ability::ManageClinicSetup->value);

        $active = $request->validate(['active' => ['required', 'boolean']])['active'];

        return response()->json(ServiceView::of($this->catalog->setActive($service, (bool) $active)));
    }
}
