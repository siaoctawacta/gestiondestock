<?php

namespace App\Services;

use RuntimeException;

/** Règle métier non respectée : renvoyée au client en 422 avec un message lisible. */
class BusinessException extends RuntimeException {}
