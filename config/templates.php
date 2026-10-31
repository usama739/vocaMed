<?php

/*
|--------------------------------------------------------------------------
| Message templates
|--------------------------------------------------------------------------
|
| The wording every clinic starts with, the placeholders a message may use, and the example values the preview fills in.
| A clinic stores a message only once it edits it (notification_templates); everything else reads from here.
|
*/

return [

    'kinds' => ['confirmation', 'reminder', 'reschedule', 'cancellation'],

    'channels' => ['sms', 'whatsapp'],

    'locales' => ['en', 'ur'],

    'variables' => ['patient_name', 'doctor', 'time', 'clinic_name', 'link'],

    'max_length' => 1000,

    'defaults' => [
        'confirmation' => [
            'en' => 'Hi {patient_name}, your appointment with {doctor} is booked for {time} at {clinic_name}. Confirm, reschedule or cancel here: {link}',
            'ur' => 'السلام علیکم {patient_name}، {clinic_name} میں {doctor} کے ساتھ آپ کی اپائنٹمنٹ {time} پر بُک ہو گئی ہے۔ تصدیق، وقت کی تبدیلی یا منسوخی یہاں سے کریں: {link}',
        ],
        'reminder' => [
            'en' => 'Reminder: {patient_name}, you have an appointment with {doctor} at {time}. Confirm or change it here: {link}',
            'ur' => 'یاد دہانی: {patient_name}، {doctor} کے ساتھ آپ کی اپائنٹمنٹ {time} پر ہے۔ تصدیق یا تبدیلی یہاں سے کریں: {link}',
        ],
        'reschedule' => [
            'en' => 'Hi {patient_name}, your appointment with {doctor} has moved to {time}. Details: {link}',
            'ur' => 'السلام علیکم {patient_name}، {doctor} کے ساتھ آپ کی اپائنٹمنٹ اب {time} پر ہے۔ تفصیل: {link}',
        ],
        'cancellation' => [
            'en' => 'Hi {patient_name}, your appointment with {doctor} at {time} has been cancelled. To book again, please call {clinic_name}.',
            'ur' => 'السلام علیکم {patient_name}، {time} پر {doctor} کے ساتھ آپ کی اپائنٹمنٹ منسوخ کر دی گئی ہے۔ دوبارہ بُک کرنے کے لیے {clinic_name} کو کال کریں۔',
        ],
    ],

    /*
    | The subject line of an email, by kind and language. Email uses the SMS wording for its body.
    */
    'subjects' => [
        'confirmation' => ['en' => 'Your appointment at {clinic_name}', 'ur' => '{clinic_name} میں آپ کی اپائنٹمنٹ'],
        'reminder' => ['en' => 'Reminder: your appointment at {clinic_name}', 'ur' => 'یاد دہانی: {clinic_name} میں آپ کی اپائنٹمنٹ'],
        'reschedule' => ['en' => 'Your appointment at {clinic_name} has moved', 'ur' => '{clinic_name} میں آپ کی اپائنٹمنٹ کا وقت بدل گیا ہے'],
        'cancellation' => ['en' => 'Your appointment at {clinic_name} was cancelled', 'ur' => '{clinic_name} میں آپ کی اپائنٹمنٹ منسوخ ہو گئی ہے'],
    ],

    'sample' => [
        'en' => [
            'patient_name' => 'Ayesha Khan',
            'doctor' => 'Dr. Rahman',
            'time' => 'Tomorrow, 4:00 PM',
            'clinic_name' => 'Your clinic',
            'link' => 'vocamed.link/p/…',
        ],
        'ur' => [
            'patient_name' => 'عائشہ خان',
            'doctor' => 'ڈاکٹر رحمان',
            'time' => 'کل، شام 4:00 بجے',
            'clinic_name' => 'آپ کا کلینک',
            'link' => 'vocamed.link/p/…',
        ],
    ],

];
