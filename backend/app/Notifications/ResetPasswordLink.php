<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Email « mot de passe oublié » : le lien ouvre la page /reset-password du frontend. */
class ResetPasswordLink extends Notification
{
    public function __construct(private string $token) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = rtrim((string) config('mm.frontend_url'), '/').'/reset-password?'.http_build_query([
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ]);
        $minutes = (int) config('auth.passwords.users.expire', 60);

        return (new MailMessage)
            ->subject('Réinitialisation de votre mot de passe — MM Cosmétiques')
            ->greeting("Bonjour {$notifiable->first_name},")
            ->line('Vous avez demandé à changer votre mot de passe MM Cosmétiques Stock Pro.')
            ->action('Choisir un nouveau mot de passe', $url)
            ->line("Ce lien est valable {$minutes} minutes.")
            ->line("Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.")
            ->salutation('MM Cosmétiques');
    }
}
