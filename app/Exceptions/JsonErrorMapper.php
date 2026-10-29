<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * Turns failures into the error body in docs/data-contract.md: `{ code, message, field?, detail?, errors? }`.
 *
 * It only answers requests that ask for JSON. Inertia page visits keep Laravel's own behaviour
 * (redirect back with the errors), and anything it does not recognise falls through to the default
 * handler, so a real bug still shows as a 500.
 */
final class JsonErrorMapper
{
    public function __invoke(Throwable $e, Request $request): ?JsonResponse
    {
        if (! $request->expectsJson()) {
            return null;
        }

        return match (true) {
            $e instanceof DomainException => $this->domain($e),
            $e instanceof ValidationException => $this->validation($e),
            $e instanceof AuthenticationException => $this->error('UNAUTHENTICATED', 401, $e),
            // Laravel has already turned authorization and missing-model failures into 403 and 404 by now.
            $e instanceof HttpExceptionInterface => $this->http($e),
            default => null,
        };
    }

    private function domain(DomainException $e): JsonResponse
    {
        return response()->json([
            ...$e->extra(),
            'code' => $e->errorCode(),
            'message' => $e->getMessage(),
            'field' => $e->field(),
            'detail' => $e->detail(),
        ], $e->status());
    }

    private function validation(ValidationException $e): JsonResponse
    {
        $errors = $e->errors();

        return response()->json([
            'code' => 'VALIDATION',
            'message' => $e->getMessage(),
            'field' => array_key_first($errors),
            'errors' => $errors,
        ], 422);
    }

    private function http(HttpExceptionInterface $e): ?JsonResponse
    {
        $code = match ($e->getStatusCode()) {
            403 => 'FORBIDDEN',
            404 => 'NOT_FOUND',
            429 => 'RATE_LIMITED',
            default => null,
        };

        if ($code === null) {
            return null;
        }

        // A throttled request says when to try again, in the header and in the body for the page's countdown.
        $headers = $e->getHeaders();
        $retryAfter = $e->getStatusCode() === 429 && isset($headers['Retry-After']) ? (int) $headers['Retry-After'] : null;

        return response()->json(
            ['code' => $code, 'message' => $e->getMessage(), ...($retryAfter === null ? [] : ['retryAfter' => $retryAfter])],
            $e->getStatusCode(),
            $headers,
        );
    }

    private function error(string $code, int $status, Throwable $e): JsonResponse
    {
        return response()->json(['code' => $code, 'message' => $e->getMessage()], $status);
    }
}
