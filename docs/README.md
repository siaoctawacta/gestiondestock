# Documentation PDF

| Document | Public |
|---|---|
| [Documentation technique — Hébergement sur LWS](MM-Cosmetiques-Stock-Pro_Documentation-technique-LWS.pdf) | Responsable technique, prestataire |
| [Guide d'utilisation — Formation des utilisateurs](MM-Cosmetiques-Stock-Pro_Guide-utilisateur.pdf) | Toutes les équipes des boutiques, formateurs |

## Mettre à jour les PDF

Les sources sont en HTML dans `src/` (une feuille de style commune, `style.css`). Les captures d'écran du guide (`src/img/`) proviennent de la version de démonstration de l'application.

```bash
cd docs
npm install          # pdf-lib
npm run build        # régénère les deux PDF (Playwright + Chromium requis)
```

Polices utilisées : Inter et JetBrains Mono, à installer sur le poste qui génère les PDF.
