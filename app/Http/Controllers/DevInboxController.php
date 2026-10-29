<?php

namespace App\Http\Controllers;

use App\Support\DevInbox;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;

/** The developer inbox: emails the app "sent" on this machine. Routes exist only locally. */
class DevInboxController extends Controller
{
    public function index(): View
    {
        return view('dev.inbox', ['messages' => DevInbox::all()]);
    }

    public function clear(): RedirectResponse
    {
        DevInbox::clear();

        return redirect()->route('dev.inbox');
    }
}
