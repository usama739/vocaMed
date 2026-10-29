<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Developer inbox</title>
    <style>
        body { margin: 0; background: #f6f7f9; color: #1c2430; font: 15px/1.55 system-ui, sans-serif; }
        main { max-width: 640px; margin: 0 auto; padding: 32px 16px 64px; }
        h1 { margin: 0 0 4px; font-size: 22px; }
        .hint { margin: 0 0 24px; color: #5b6573; }
        .mail { margin: 0 0 16px; padding: 20px; background: #fff; border: 1px solid #dde1e7; border-radius: 12px; }
        .meta { margin: 0 0 12px; color: #5b6573; font-size: 13px; }
        .subject { margin: 0 0 12px; font-size: 17px; font-weight: 600; }
        .mail p { margin: 0 0 10px; }
        .button { display: inline-block; margin: 4px 0 12px; padding: 10px 18px; background: #0f766e; color: #fff; border-radius: 8px; font-weight: 600; text-decoration: none; }
        .url { display: block; margin: 0 0 12px; color: #5b6573; font-size: 12px; word-break: break-all; }
        .empty { padding: 32px; text-align: center; color: #5b6573; background: #fff; border: 1px dashed #c5cbd4; border-radius: 12px; }
        form { margin-top: 24px; }
        form button { padding: 8px 14px; background: none; border: 1px solid #c5cbd4; border-radius: 8px; color: #1c2430; font: inherit; cursor: pointer; }
    </style>
</head>
<body>
<main>
    <h1>Developer inbox</h1>
    <p class="hint">Emails this app sent on your machine, newest first. Local only: production sends real email.</p>

    @forelse ($messages as $message)
        <article class="mail">
            <p class="meta">To {{ $message['to'] }} &middot; {{ $message['at'] }}</p>
            <p class="subject">{{ $message['subject'] }}</p>
            @if ($message['greeting'])
                <p>{{ $message['greeting'] }}</p>
            @endif
            @foreach ($message['lines'] as $line)
                <p>{{ $line }}</p>
            @endforeach
            @if ($message['action'])
                <a class="button" href="{{ $message['action']['url'] }}">{{ $message['action']['text'] }}</a>
                <span class="url">{{ $message['action']['url'] }}</span>
            @endif
        </article>
    @empty
        <p class="empty">Nothing yet. Sign up or ask for a password reset, then come back.</p>
    @endforelse

    @if (count($messages) > 0)
        <form method="post" action="{{ route('dev.inbox.clear') }}">
            @csrf
            <button type="submit">Clear inbox</button>
        </form>
    @endif
</main>
</body>
</html>
