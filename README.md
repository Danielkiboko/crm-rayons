# Rayons CRM — Plateforme Multi-Canal & Routes Télécoms Directes

## Démarrage rapide
```bash
cd backend && cp .env.example .env && npm i && npm run dev
cd ../frontend && npm i && npm run dev     # http://localhost:5173
```

### Compte par défaut
- **Email** : `admin@rayons.cd`
- **Mot de passe** : `admin1234`

## Fonctionnalités clés
1. **Routes Directes des Opérateurs Télécoms (sans Twilio)** :
   - Détection automatique de l'opérateur selon le préfixe du numéro (**Vodacom RDC** `081/082/083`, **Airtel RDC** `097/098/099`, **Orange RDC** `080/084/085/089`, **Africell RDC** `090/091`).
   - Connexion directe aux gateways HTTP/SMPP des opérateurs télécoms pour les **SMS** et **RCS**.
2. **Email Direct depuis le compte enregistré** :
   - Lorsqu'un client s'inscrit ou se connecte avec son adresse email, tous ses envois d'emails utilisent automatiquement cette adresse email comme expéditeur direct (`Nom Entreprise <email_du_client>`).
3. **Statistiques complètes de toutes les transactions** :
   - Suivi de chaque transaction avec référence unique (`RAY-XXXX`), canal, opérateur télécom, expéditeur, destinataire, coût unitaire (USD) et statut.
   - Tableaux analytiques par opérateur, historique journalier et export CSV complet.

## Déploiement Firebase (`crm-rayons`)
- **Frontend (Firebase Hosting)** : `https://crm-rayons.web.app`
- **Backend API (Cloud Functions v2)** : `backend/src/firebase.js` (`europe-west1`), routé automatiquement via `/api/**` et `/webhooks/**`
- **Base de données (Cloud Firestore)** : collections `tenants`, `users`, `contacts`, `campaigns`, `messages`, `templates`, `auto_reply_rules`, `credit_logs`, `recharge_requests`, `blacklist`, `webhook_logs`, `audit_logs`

```bash
# Construire le frontend
npm --prefix frontend run build

# Déployer Hosting, Functions et règles Firestore
npx -y firebase-tools@latest deploy --project crm-rayons

# Migrer les données locales (.pgdata) vers Cloud Firestore
npm --prefix backend run firebase:migrate
```

## Webhooks Directs
- SMS/RCS entrants opérateurs télécoms : `POST {PUBLIC_URL}/webhooks/telecom/<tenantId>`
- Statuts de livraison (DLR) télécoms : `POST {PUBLIC_URL}/webhooks/telecom-status`
- WhatsApp Cloud API : `{PUBLIC_URL}/webhooks/whatsapp/<tenantId>`
