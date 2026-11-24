<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Audit;
use App\Support\Permissions;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Connexion : renvoie un jeton Sanctum et le profil. */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => 'required|email', 'password' => 'required|string']);
        $user = User::where('email', mb_strtolower(trim($data['email'])))->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'Email ou mot de passe incorrect.']);
        }
        if (! $user->isUsable()) {
            throw ValidationException::withMessages(['email' => 'Ce compte est désactivé. Contactez votre administrateur.']);
        }

        $user->forceFill(['last_login_at' => now()])->save();
        $token = $user->createToken('web', ['*'], now()->addDays((int) config('mm.token_days', 30)))->plainTextToken;

        return response()->json(['token' => $token, 'user' => Present::user($user)]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(null, 204);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(Present::user($request->user()));
    }

    /** Envoie le lien de réinitialisation. Répond toujours pareil (ne révèle pas si l'email existe). */
    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => 'required|email']);
        $user = User::where('email', mb_strtolower(trim($data['email'])))->whereNull('deleted_at')->where('is_active', true)->first();
        if ($user) {
            Password::broker()->sendResetLink(['email' => $user->email]);
        }

        return response()->json(['message' => 'Si un compte existe, un email a été envoyé.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => 'required|string',
            'email' => 'required|email',
            'password' => ['required', 'string', PasswordRule::min(8)],
        ]);
        $status = Password::broker()->reset($data, function (User $user, string $password) {
            $user->forceFill(['password' => $password])->save();
            $user->tokens()->delete(); // déconnecte toutes les sessions existantes
        });
        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['token' => 'Lien invalide ou expiré. Refaites une demande.']);
        }

        return response()->json(['message' => 'Mot de passe mis à jour.']);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $data = $request->validate(['password' => ['required', 'string', PasswordRule::min(8)]]);
        $request->user()->forceFill(['password' => $data['password']])->save();

        return response()->json(null, 204);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'phone' => 'nullable|string|max:50',
        ]);
        $user = $request->user();
        $user->update($data);

        return response()->json(Present::user($user));
    }

    /** Remise > 15 % : vérifie les identifiants d'un superviseur sans ouvrir de session. */
    public function verifySupervisor(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => 'required|email', 'password' => 'required|string']);
        $sup = User::where('email', mb_strtolower(trim($data['email'])))->first();
        if (! $sup || ! Hash::check($data['password'], $sup->password) || ! $sup->isUsable()) {
            throw ValidationException::withMessages(['email' => 'Identifiants superviseur invalides.']);
        }
        if (! Permissions::can($sup, 'discount.approve')) {
            throw ValidationException::withMessages(['email' => 'Ce compte ne peut pas autoriser une remise.']);
        }
        Audit::log('SUPERVISOR', 'users', $sup->id, "Autorisation de remise par {$sup->email} pour {$request->user()->email}");

        return response()->json(Present::user($sup));
    }
}
