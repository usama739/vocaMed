<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Clinic;
use App\Views\Admin\OverviewView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** D1: how the clinic is doing. Read only; the page is the Inertia page and the same address asked for JSON is its read model. */
class OverviewController extends Controller
{
    public function index(Request $request, OverviewView $view): Response|JsonResponse
    {
        if (! $request->expectsJson()) {
            return Inertia::render('admin/overview');
        }

        $period = $request->query('period');

        /** @var Clinic $clinic */
        $clinic = $request->user()->clinic;

        // Rates and shares stay decimals even when whole (50.0, not 50), so the contract's kinds hold for every clinic.
        return response()->json(
            $view->of($clinic, is_string($period) && in_array($period, OverviewView::PERIODS, true) ? $period : 'month'),
            options: JSON_PRESERVE_ZERO_FRACTION,
        );
    }
}
