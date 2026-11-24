<?php

return [
    // Adresse publique du frontend (liens des emails, CORS). Exemple : https://stockpro.mmconsultingtg.com
    'frontend_url' => env('FRONTEND_URL', 'http://localhost:5173'),

    // Durée de validité d'une connexion (jeton), en jours
    'token_days' => (int) env('TOKEN_DAYS', 30),
];
