<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\DemoRequestRequest;
use App\Models\DemoRequest;
use Illuminate\Http\JsonResponse;

class DemoRequestController extends Controller
{
    public function store(DemoRequestRequest $request): JsonResponse
    {
        DemoRequest::query()->create($request->validated());

        return response()->json(['ok' => true]);
    }
}
