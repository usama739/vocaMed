<?php

namespace App\Http\Controllers\Admin;

use App\Authorization\Ability;
use App\Http\Controllers\Controller;
use App\Models\Clinic;
use App\Views\Admin\AuditView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/** D8: the clinic's history. Read only. */
class AuditController extends Controller
{
    public function index(Request $request, AuditView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('admin/audit');
        }

        Gate::authorize(Ability::ViewAuditLog->value);

        $days = (int) $request->query('days', 7);
        $days = in_array($days, [1, 7, 30], true) ? $days : 7;
        $userId = $request->query('userId');
        $category = $request->query('category');

        /** @var Clinic $clinic */
        $clinic = $request->user()->clinic;

        return response()->json($view->of(
            $clinic,
            $days,
            is_string($userId) ? $userId : null,
            is_string($category) ? $category : null,
            max(1, (int) $request->query('page', 1)),
        ));
    }
}
