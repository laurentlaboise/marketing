'use strict';

/**
 * Unique French reviews for six GSC AI-tool URLs (batch A).
 * Official-site facts only. No invented prices, ratings, or features.
 */

const visitFr = (href) => `<div class="cta-bar">
        <a class="btn btn-primary" href="${href}" target="_blank" rel="noopener noreferrer"><i class="fas fa-globe"></i> Visiter le site web</a>
      </div>`;

module.exports = [
  {
    rel: 'fr/resources/ai-tools/adobe-firefly/index.html',
    meta: 'Revue Adobe Firefly pour agences Creative Cloud en Asie du Sud-Est: images, remplissage génératif, effets de texte et vidéo. Droits et crédits à relire sur adobe.com.',
    lead: 'Firefly est la couche générative d’Adobe: images, remplissage, effets de texte et, selon l’offre actuelle, vidéo. Ce n’est pas une garantie juridique de droits d’usage, même si Adobe décrit un entraînement sur fonds licenciés.',
    sections: `
    <section>
      <h2>Qu’est-ce qu’Adobe Firefly&nbsp;?</h2>
      <div class="card">
        <p><a href="https://www.adobe.com/products/firefly.html" target="_blank" rel="noopener noreferrer">Adobe Firefly</a> est la famille d’outils génératifs d’Adobe: création d’images à partir d’un texte, remplissage génératif sur une photo déjà ouverte, effets appliqués à une ligne de texte, et génération ou retouche vidéo selon ce que la page produit affiche au moment où vous lisez. L’intérêt, pour une agence, n’est pas d’ouvrir encore un site isolé: Firefly s’insère dans Creative Cloud, donc dans Photoshop, Illustrator, Express et, pour les mises en page longues, InDesign. Beaucoup de studios à Bangkok, Vientiane ou Hô Chi Minh-Ville paient déjà cette suite. Firefly est la couche qui propose de remplir un ciel, d’étendre un fond de catalogue ou d’essayer un titre campagne sans quitter le fichier de travail.</p>
        <p>Adobe affirme entraîner ses modèles Firefly sur Adobe Stock licencié et sur des contenus libres de droits ou du domaine public. C’est une position de l’éditeur, pas une attestation d’avocat valable dans tous les pays. Les conditions d’usage commercial, les mentions de Content Credentials et le périmètre exact des modèles concernés figurent sur adobe.com. Elles bougent. Un visuel généré pour une pub Facebook n’a pas automatiquement le même statut qu’une photo Stock classique avec facture; il faut relire la page juridique du compte, pas un résumé de blog.</p>
        <p>L’application web Firefly liste aussi, à certaines dates, des modèles tiers (autres fournisseurs) à côté des modèles Adobe. Quand c’est le cas, les discours d’Adobe sur l’entraînement Stock ne s’appliquent pas de la même façon à chaque moteur. Avant de livrer un client hôtelier ou une marque alimentaire, notez quel modèle a produit le fichier et ouvrez les conditions associées. Cette page ne recopie aucun catalogue de modèles: il change trop vite.</p>
        <p>Firefly n’est pas un DAM, pas un outil de retouche couleur calibrée à lui seul, et pas un substitut à une séance photo quand le client vend une chambre réelle ou un plat du jour. C’est un accélérateur de variantes et de fonds, utile si un graphiste relit le résultat dans Photoshop ou InDesign. Les textes lao, thaï ou vietnamiens dessinés dans l’image restent souvent cassés: on les compose ensuite dans l’appli, on ne les laisse pas au modèle.</p>
        <p>Pour un opérateur francophone qui travaille depuis le Laos ou la Thaïlande avec des briefs en français et des livrables en anglais, Firefly aide à produire des planches d’ambiance pendant l’atelier. Il ne décide pas si le visuel peut circuler en print, en OOH ou en catalogue export. Cette décision reste dans les conditions Adobe et dans le contrat client.</p>
      </div>
    </section>
    <section>
      <h2>Ce que la page produit annonce</h2>
      <div class="card">
        <ul>
          <li>Génération d’images à partir d’une description, dans l’app Firefly et dans les applis Creative Cloud qui l’exposent</li>
          <li>Remplissage génératif: ajouter, retirer ou étendre une zone sur une image existante</li>
          <li>Effets de texte génératifs pour habiller un titre, puis le reprendre dans une mise en page</li>
          <li>Fonctions vidéo Firefly (génération ou édition assistée) selon l’offre affichée sur adobe.com</li>
          <li>Intégration Creative Cloud et consommation de crédits génératifs liés au plan — détail à lire dans le compte</li>
        </ul>
        <p>Adobe ajoute parfois des tableaux d’humeur, des modèles personnalisés en version expérimentale ou d’autres modules. Traitez-les comme des options à vérifier dans votre région et votre plan, pas comme un socle garanti pour un devis annuel.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Bon usage en agence</h2>
        <div class="card">
          <ul>
            <li>Variantes de fond ou d’objet pour une pub déjà conçue dans Photoshop</li>
            <li>Maquettes de titre campagne avant de figer la typo dans InDesign</li>
            <li>Planches d’idées internes, clairement marquées comme générées, avant un shooting</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Limites honnêtes</h2>
        <div class="card">
          <ul>
            <li>La position Adobe sur l’entraînement n’est pas une garantie juridique locale</li>
            <li>Les écritures locales dans l’image sont souvent illisibles ou inventées</li>
            <li>Les crédits et le périmètre vidéo changent: pas de chiffre recopié ici</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Creative Cloud déjà là: comment travailler en SEA</h2>
      <div class="card">
        <p>Le vrai argument pour une PME ou une petite agence francophone en Asie du Sud-Est n’est pas « encore un générateur ». C’est que le fichier Photoshop du client existe déjà, que le catalogue InDesign du resort se met à jour chaque saison, et que le directeur artistique sait déjà où vivent les calques. Firefly sert à proposer trois fonds de terrasse ou à retirer un objet gênant sur une photo de plat, puis à reprendre le travail dans les outils que l’équipe maîtrise. Si personne n’ouvre Photoshop dans la boîte, un autre générateur web suffira peut-être; Firefly gagne surtout quand Creative Cloud est déjà le standard.</p>
        <p>Pour un hôtel à Luang Prabang ou un restaurant à District 1, n’utilisez pas un visage généré comme « équipe de la réception ». Les clients locaux reconnaissent les lieux et les gens. Servez-vous de Firefly pour des textures, des arrière-plans, des objets de table, des variantes de packaging — et photographiez le bâtiment, la chambre et le personnel. Un visuel trop lisse sur une landing qui promet une vue réelle se retourne contre la marque dès le premier commentaire Facebook.</p>
        <p>Les crédits génératifs arrivent souvent avec le plan Creative Cloud. Nous n’inscrivons aucun volume ni aucun prix: Adobe les ajuste. Avant de promettre à un client « autant de visuels IA que vous voulez », ouvrez la console de crédits du compte agence et voyez ce que consomme un remplissage haute résolution ou un essai vidéo. Un junior qui itère cinquante fois sur un ciel peut vider le pot du mois sans livrer une pub.</p>
        <p>Côté droits, relisez les pages Adobe sur l’usage commercial de Firefly et, si vous avez choisi un modèle tiers dans l’interface, les conditions de ce modèle. Un client export qui vend en Europe ou aux États-Unis demandera parfois une trace (Content Credentials, nom du modèle, date). Archivez ces métadonnées avec le fichier livré. Cette revue n’est pas un conseil juridique: c’est un rappel de lire adobe.com plutôt que de répéter « commercially safe » comme un slogan.</p>
        <p>Dans InDesign, le flux réaliste est: générer ou remplir dans Photoshop / Firefly, vérifier la résolution et les bords, placer le bloc, composer le lao, le thaï ou le vietnamien à la main, puis exporter le PDF print avec le profil couleur habituel de l’imprimeur. Firefly ne gère pas la chaîne graphique locale. Un catalogue spa imprimé à Vientiane se juge à la couleur papier, pas au rendu écran de l’app web.</p>
        <p>Sur les pubs Facebook, LINE et TikTok de la région, un format carré ou vertical se produit vite. Testez le recadrage mobile avant d’acheter du média. Une image générée trop chargée devient illisible sur un petit écran 4G en province. Réduisez les détails, gardez un logo lisible, et faites relire le texte d’annonce par quelqu’un qui parle la langue de la cible — pas par le modèle d’image.</p>
        <p>Si l’équipe compare Firefly à un générateur autonome, posez une question simple: où le fichier doit-il atterrir? Si la réponse est « dans le PSD / INDD du client, avec ses nuanciers », Firefly dans Creative Cloud évite un aller-retour d’exports. Si la réponse est « un moodboard Discord pour un pitch de 20 minutes », un autre outil peut suffire. Choisissez selon le fichier de livraison, pas selon une liste de fonctionnalités d’un article.</p>
        <p>Dernier point d’atelier: marquez clairement les planches générées dans le dossier de campagne. Un commercial pressé peut envoyer au client une image Firefly comme si c’était une photo du resort. La correction coûte plus cher que le temps gagné. Une convention interne du type « dossier /ia-brouillon » et une légende sur la planche évitent ce malentendu.</p>
      </div>
    </section>
    <section>
      <h2>Tarifs</h2>
      <div class="card">
        <p>Le répertoire indique un modèle freemium: accès limité et crédits liés à Creative Cloud ou à un plan Firefly. Aucun montant n’est recopié ici. Vérifiez crédits, génération vidéo et conditions d’usage sur <a href="https://www.adobe.com/products/firefly.html" target="_blank" rel="noopener noreferrer">adobe.com/products/firefly.html</a>.</p>
      </div>
    </section>
    <section>
      <h2>Obtenir Adobe Firefly</h2>
      ${visitFr('https://www.adobe.com/products/firefly.html')}
    </section>`,
  },
  {
    rel: 'fr/resources/ai-tools/grammarly/index.html',
    meta: 'Revue Grammarly pour équipes SEA et opérateurs francophones: grammaire, ton et clarté surtout en anglais. Le français se vérifie; pas un relecteur unique du lao ou du thaï.',
    lead: 'Grammarly est un assistant d’écriture: grammaire, ton, clarté, extensions et, selon leur doc, une aide générative. Il est le plus utile sur des brouillons anglais pour clients internationaux, pas comme seul filtre d’une page locale.',
    sections: `
    <section>
      <h2>Qu’est-ce que Grammarly&nbsp;?</h2>
      <div class="card">
        <p><a href="https://www.grammarly.com" target="_blank" rel="noopener noreferrer">Grammarly</a> corrige et commente un texte pendant que vous l’écrivez: fautes, ponctuation, formulations lourdes, registre (plus formel, plus concis). Le produit existe en extension de navigateur, applications de bureau, clavier mobile et intégrations dans des outils de rédaction que l’éditeur liste sur son site. Ce n’est pas un CMS et ce n’est pas un traducteur de site entier. C’est une couche qui s’accroche au champ où vous tapez — e-mail, Docs, CMS, parfois LinkedIn — et qui souligne.</p>
        <p>Grammarly a longtemps été pensé d’abord pour l’anglais. L’éditeur documente désormais un soutien dans d’autres langues, listées sur ses pages d’aide et sur grammarly.com/languages. Cette liste bouge. Nous ne la recopions pas. Le français y figure parmi d’autres; cela ne veut pas dire qu’une suggestion française a la même maturité qu’une suggestion anglaise, ni qu’elle respecte le ton d’une agence à Vientiane. Toute phrase française destinée à un client ou à une page publique doit être relue par un humain.</p>
        <p>Sous des noms que Grammarly a fait évoluer (GrammarlyGO, aides génératives, réécritures de paragraphe), le produit propose aussi de reformuler ou de démarrer un brouillon. Traitez cela comme un premier jet. Un e-mail « on a vu votre hôtel, on peut parler mardi » peut sortir correct en anglais et rester maladroit pour un directeur d’établissement thaïlandais. L’outil ne connaît pas votre relation commerciale.</p>
        <p>Pour une équipe qui écrit surtout en lao ou en thaï, Grammarly n’est pas le relecteur principal. Ces langues ne doivent pas être considérées comme couvertes tant que la page officielle des langues ne les affiche pas clairement, et même alors une page locale se juge au sens, aux interdits publicitaires et au tutoiement de marque. Un soulignement dans le navigateur n’a jamais validé une landing en lao.</p>
        <p>Les forfaits vont d’un socle gratuit à des plans payants et, pour certaines organisations, à une offre équipe. Les noms et plafonds changent. Ouvrez grammarly.com. Cette revue ne chiffre rien.</p>
      </div>
    </section>
    <section>
      <h2>Ce que Grammarly documente</h2>
      <div class="card">
        <ul>
          <li>Suggestions de grammaire, d’orthographe et de ponctuation dans le flux d’écriture</li>
          <li>Indications de clarté, de concision et de ton, plus riches en anglais que dans les autres langues listées</li>
          <li>Extensions navigateur et applications (bureau, iOS, Android) selon les fiches officielles</li>
          <li>Aide générative / GrammarlyGO pour reformuler ou amorcer un texte, telle que l’éditeur la décrit</li>
          <li>Détection automatique de la langue parmi celles qu’ils publient — à vérifier sur leur page langues</li>
        </ul>
        <p>Les fonctions avancées (ton, réécriture de paragraphe, traduction inline, espaces d’équipe) dépendent du plan et de la langue. Ne promettez pas un module à un client avant d’avoir ouvert le compte réel.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Là où ça aide</h2>
        <div class="card">
          <ul>
            <li>Brouillons anglais pour un client hôtelier, importateur ou siège régional</li>
            <li>Relecture d’e-mails et de propositions avant envoi international</li>
            <li>Filet de sécurité sur un CMS anglais, à condition qu’un rédacteur relise</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Là où ça ne suffit pas</h2>
        <div class="card">
          <ul>
            <li>Seul relecteur d’une page lao, thaïe ou vietnamienne</li>
            <li>Textes juridiques, médicaux ou de prix: l’outil n’a pas vos sources</li>
            <li>Français public: les suggestions existent, la relecture humaine reste obligatoire</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Brouillons anglais, pages locales: le bon partage</h2>
      <div class="card">
        <p>Dans une agence SEA, le français et l’anglais servent souvent de langues de travail avec le client international, tandis que Facebook, LINE et le site vitrine parlent thaï, lao ou vietnamien. Grammarly est utile sur la première couche: le pitch deck en anglais, l’e-mail au revenue manager, la FAQ destinée aux voyageurs qui googlenent en anglais. Il est dangereux dès qu’on le prend pour un tampon « qualité » sur la page locale. Un texte thaï corrigé « à l’oreille » par quelqu’un qui s’appuie sur Grammarly en anglais, puis recollé, produit des calques et des anglicismes que la cible sent tout de suite.</p>
        <p>Le flux que nous recommandons: rédiger le fond en langue de livraison avec un locuteur, puis, si le livrable est bilingue, passer l’anglais dans Grammarly pour attraper les accords et les phrases trop longues. Ne pas inverser. Ne pas écrire d’abord en anglais Grammarly, puis faire traduire mot à mot vers le lao. Vous obtiendrez une page qui sonne traduite, donc peu crédible pour une PME de Vientiane qui vend à des voisins, pas à un touriste de passage seulement.</p>
        <p>GrammarlyGO ou l’aide générative peut sortir un premier e-mail de relance en anglais. Avant d’envoyer, retirez les formulations trop américaines (« circling back », « looping you in ») si votre interlocuteur est un hôtelier de Chiang Mai ou un importateur de Pakse. Adaptez le niveau de formalité. L’outil propose un curseur de ton; il ne connaît pas la hiérarchie locale ni le fait que beaucoup de décisions se referment sur WhatsApp ou LINE, pas dans la longue chaîne d’e-mails.</p>
        <p>Sur le français, servez-vous des soulignements comme d’une alerte, pas d’une correction automatique acceptée en bloc. Une suggestion peut aplatir un style, franciser un nom de lieu à tort, ou « corriger » une marque. Les opérateurs francophones en SEA écrivent souvent un français de travail mêlé de termes anglais de media buying: Grammarly voudra parfois tout lisser. Décidez vous-même ce qui reste en anglais métier.</p>
        <p>N’activez pas l’assistant génératif sur un document qui contient des tarifs non publics, des clauses, ou des données personnelles de clients. Même si l’éditeur décrit des contrôles d’entreprise sur certains plans, une petite structure n’a pas toujours ces réglages en place. Collez le paragraphe anodin, pas le tableau de commission. Cette page n’est pas un audit de confidentialité: lisez la politique Grammarly et celle de votre client.</p>
        <p>Pour une page produit e-commerce en vietnamien destinée à Hô Chi Minh-Ville, un locuteur et Search Console valent plus qu’un score Grammarly. Si l’éditeur liste le vietnamien parmi les langues aidées, vous pouvez y voir un filet d’orthographe — toujours à vérifier. Cela ne remplace pas la connaissance des mots que les gens tapent vraiment, ni les règles locales sur les allégations santé ou les promotions.</p>
        <p>Côté extensions, testez-les sur le navigateur que l’équipe utilise vraiment, y compris sur un CMS local un peu ancien. Parfois le champ de l’éditeur visuel ne remonte pas le texte correctement. Si l’extension est aveugle, rédigez dans Docs puis collez. Ne supposez pas que « Grammarly est partout » parce que l’icône est dans Chrome.</p>
        <p>Mesurez l’outil à des e-mails qui obtiennent une réponse, pas à un nombre de suggestions acceptées. Une phrase trop polie en anglais peut sembler distante; une phrase trop directe peut sembler rude. Le rédacteur qui connaît le client reste le dernier filtre. Grammarly réduit les fautes visibles pour un lecteur international; il ne vend pas la chambre.</p>
      </div>
    </section>
    <section>
      <h2>Tarifs</h2>
      <div class="card">
        <p>Modèle freemium: un socle gratuit et des plans payants. Nous ne recopions aucun prix mensuel. Détail des langues, de l’aide générative et des sièges équipe sur <a href="https://www.grammarly.com" target="_blank" rel="noopener noreferrer">grammarly.com</a>.</p>
      </div>
    </section>
    <section>
      <h2>Obtenir Grammarly</h2>
      ${visitFr('https://www.grammarly.com')}
    </section>`,
  },
  {
    rel: 'fr/resources/ai-tools/make/index.html',
    meta: 'Revue Make (ex-Integromat) pour PME SEA: scénarios visuels entre formulaires, Slack, WhatsApp et CRM. Pas un outil de copy. Clés API et risque de spam à maîtriser.',
    lead: 'Make est une toile d’automatisation: modules, scénarios, connexions d’apps, plus des fonctions d’agents que l’éditeur documente. Ça relie des outils. Ça n’écrit pas votre page.',
    sections: `
    <section>
      <h2>Qu’est-ce que Make&nbsp;?</h2>
      <div class="card">
        <p><a href="https://www.make.com" target="_blank" rel="noopener noreferrer">Make</a>, anciennement Integromat, assemble des automatisations visuelles. Vous posez des modules sur un canevas: un déclencheur (nouveau formulaire, nouvelle ligne, webhook), puis des actions (créer une fiche, poster un message, appeler une API). Chaque module appartient à une appli connectée ou à une fonction utilitaire (routeur, itérateur, agrégateur, HTTP). Ce n’est pas un traitement de texte. Si vous cherchez un assistant pour rédiger une landing, vous n’êtes pas au bon endroit.</p>
        <p>L’éditeur documente aussi des modules et des agents d’IA: un agent peut raisonner sur un e-mail entrant puis appeler d’autres modules, avec un journal de raisonnement dans le scénario. Les noms exacts des apps d’agents et leur disponibilité par plan se lisent dans l’aide Make. Nous n’en figeons pas une version. Un agent mal borné qui « décide » d’écrire à tous les contacts d’une feuille est plus dangereux qu’un scénario stupide mais prévisible.</p>
        <p>Make se paie souvent à l’opération (une exécution de module) avec un palier gratuit. Les quotas, la fréquence minimale et le nombre de scénarios actifs changent. Ouvrez make.com. Cette page ne recopie pas la grille. Un formulaire public qui part à chaque envoi peut consommer le mois plus vite qu’un export quotidien.</p>
        <p>Pour une petite équipe à Vientiane ou Bangkok, la valeur concrète est de relier ce que le site sait déjà faire — un formulaire de devis, un paiement, une inscription webinar — à l’endroit où les humains répondent: Slack, un groupe WhatsApp Business, un CRM, parfois Gmail. Sans cette passerelle, les leads restent dans la boîte du thème WordPress jusqu’au lendemain.</p>
        <p>Make n’héberge pas votre base clients à votre place de façon magique. Les données transitent par les connexions que vous autorisez. Une clé API collée dans un module visible par trop de collègues, ou un scénario partagé trop large, expose des e-mails et des numéros. Traitez Make comme un tuyau, pas comme un coffre.</p>
      </div>
    </section>
    <section>
      <h2>Ce que Make décrit dans le produit</h2>
      <div class="card">
        <ul>
          <li>Scénarios visuels: déclencheur, filtres, routeurs, gestion d’erreurs</li>
          <li>Modules d’applications et modules HTTP / webhooks pour les outils absents du catalogue</li>
          <li>Connexions OAuth ou par clé, stockées dans le compte Make</li>
          <li>Fonctions d’IA et d’agents documentées par Make, à activer seulement si le plan et la région les montrent</li>
          <li>Historique d’exécutions pour rejouer ou diagnostiquer un flux raté</li>
        </ul>
        <p>Le catalogue d’apps évolue. WhatsApp, Slack ou un CRM donné peuvent exiger une appli officielle, une appli intermédiaire ou un webhook. Vérifiez la fiche module avant de promettre le flux dans un devis.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Scénarios utiles</h2>
        <div class="card">
          <ul>
            <li>Formulaire site → notification Slack ou WhatsApp → fiche CRM</li>
            <li>Nouvelle commande e-commerce → message interne, sans e-mail client automatique au début</li>
            <li>Export nocturne d’un tableur vers un dossier d’équipe, avec filtre</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Risques fréquents</h2>
        <div class="card">
          <ul>
            <li>Itérateur sans filtre: le client reçoit dix messages d’affilée</li>
            <li>Clés API dans un scénario cloné et renvoyé au mauvais destinataire</li>
            <li>Agent IA qui invente un suivi commercial et l’envoie tout seul</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Relier le site au chat, sans spammer</h2>
      <div class="card">
        <p>Le cas le plus demandé par les PME de la région est simple: quelqu’un remplit le formulaire « demander un devis » sur le site, et le commercial le voit là où il travaille déjà. Souvent ce n’est pas le CRM flambant neuf, c’est un canal Slack d’agence ou un WhatsApp. Make peut faire ce pont si le module existe dans votre compte ou si vous passez par un webhook. Construisez d’abord la notification interne. N’ajoutez un message automatique vers le prospect qu’après avoir testé vingt envois réels. Un scénario qui envoie « Merci, on vous contacte » à chaque double-clic, ou à chaque spam, brûle la confiance plus vite qu’il n’en crée.</p>
        <p>LINE est le canal quotidien en Thaïlande; WhatsApp l’est pour beaucoup d’opérateurs lao et pour les clients internationaux. Ne supposez pas qu’un module officiel existe pour chaque messagerie. Ouvrez le catalogue Make. S’il manque, un middleware ou l’API officielle de la plateforme, derrière un module HTTP, reste possible — à condition qu’un développeur relise les jetons et les politiques d’usage. Un flux bricolé qui viole les règles WhatsApp Business fait fermer le numéro. Ce n’est pas un détail d’intégration, c’est le canal de vente.</p>
        <p>Les clés API du CRM, de la messagerie et du site doivent vivre dans les connexions Make, avec le moins de personnes admin possible. Quand un freelance quitte l’équipe, révoquez. Ne commitez pas une clé dans une capture d’écran de scénario envoyée sur Facebook. Les dossiers clients (passeports de voyageurs, justificatifs, listes d’écoliers pour un événement) n’ont rien à faire dans un champ qui transite vers un agent IA. Filtrez les pièces jointes sensibles avant tout appel de modèle.</p>
        <p>Un scénario mal conçu spam le client de plusieurs façons: boucle (le CRM met à jour un champ, ce qui redéclenche le scénario), absence de « déjà notifié », ou agent qui reformule et renvoie. Activez l’historique, posez un filtre sur un identifiant unique, et testez en « Run once » avec vos propres coordonnées. Si vous recevez trois SMS, le client aussi. Make exécute ce que vous avez dessiné, y compris les erreurs.</p>
        <p>Côté marketing, Make peut pousser une ligne vers une audience ou un tableur d’acquisition. Il ne remplace pas le consentement. Un formulaire laosien ou thaïlandais doit dire clairement à quoi servent l’e-mail et le numéro. L’automatisation n’absout pas. Cette revue n’est pas un avis juridique; elle dit seulement de ne pas brancher un itérateur sur toute la base « parce que c’est possible ».</p>
        <p>Les fonctions d’agents IA de Make aident quand l’entrée est du texte libre (« le client a écrit trois paragraphes dans le formulaire ») et que vous voulez classer ou extraire un champ avant de créer le ticket. Bornez l’agent: pas d’envoi externe sans module d’approbation humaine au début. Un commercial qui valide dans Slack (« OK pour répondre ») coûte moins cher qu’un e-mail halluciné avec un tarif inventé.</p>
        <p>Si personne dans l’équipe n’aime les canevas, Make restera un fichier mort. Prévoyez une personne responsable des scénarios, un nommage clair (client / canal / action), et une revue trimestrielle des flux encore actifs. Les vieux scénarios Integromat oubliés continuent parfois de tourner. Coupez ce qui n’a plus de propriétaire.</p>
        <p>Enfin, ne vendez pas Make comme « l’IA de l’agence ». Vendez un délai de réponse plus court sur les devis, et montrez le scénario. Si le gain n’apparaît pas en une semaine de tests, gardez le copier-coller manuel et revenez plus tard. Un outil d’automatisation se juge aux messages en trop et aux messages manqués, pas au nombre de modules sur le canevas.</p>
      </div>
    </section>
    <section>
      <h2>Tarifs</h2>
      <div class="card">
        <p>Freemium: un palier gratuit puis des plans selon les opérations et les fonctions avancées. Aucun tarif n’est recopié. Grille actuelle sur <a href="https://www.make.com" target="_blank" rel="noopener noreferrer">make.com</a>.</p>
      </div>
    </section>
    <section>
      <h2>Obtenir Make</h2>
      ${visitFr('https://www.make.com')}
    </section>`,
  },
  {
    rel: 'fr/resources/ai-tools/reflect-notes/index.html',
    meta: 'Revue Reflect Notes pour marketeurs SEA: notes en réseau, journal, chiffrement déclaré de bout en bout et Reflect AI. Un plan unique, détail sur reflect.app. Pas un wiki d’agence.',
    lead: 'Reflect est un carnet personnel en réseau: notes du jour, backlinks, clipper, sync, calendrier. L’éditeur annonce un chiffrement de bout en bout et une IA s’appuyant sur GPT-4 et Whisper. Ce n’est pas l’intranet de l’agence.',
    sections: `
    <section>
      <h2>Qu’est-ce que Reflect&nbsp;?</h2>
      <div class="card">
        <p><a href="https://reflect.app" target="_blank" rel="noopener noreferrer">Reflect</a> propose des notes reliées entre elles plutôt qu’une arborescence de dossiers. On commence souvent par la note du jour, on lie un client, un concept ou une campagne avec des doubles crochets, et l’on retrouve le fil plus tard via les backlinks ou la recherche. Le site officiel insiste sur la vitesse de capture, le journal, un clipper de navigateur, la synchro entre appareils et une application iOS. Un mode hors ligne est décrit pour certains clients. Ce n’est pas Notion: il n’y a pas de bases de données d’équipe ni de kanban d’agence comme cœur du produit.</p>
        <p>Reflect déclare un chiffrement de bout en bout: le contenu des notes ne serait pas lisible par l’éditeur en clair sur ses serveurs. C’est leur affirmation produit et vie privée, à relire sur reflect.app. Elle a une conséquence concrète pour une PME: moins d’IA « entreprise » qui indexe tout le graphe pour toute la boîte. Quand vous activez Reflect AI, leur page de confidentialité indique que le texte ou l’audio explicitement sélectionné part vers des API tierces (ils mentionnent notamment GPT-4 et Whisper d’OpenAI sur la page produit; la politique évoque aussi d’autres API selon les fonctions). Le chiffrement local ne couvre pas ce que vous envoyez volontairement au modèle.</p>
        <p>Les intégrations annoncées comprennent un calendrier Google ou Outlook pour les notes de réunion, la synchro de surlignages Kindle, et des modèles de notes. Utile pour un stratège qui enchaîne les appels, pas pour stocker les contrats PDF de vingt clients avec des droits d’accès granulaires. Il n’y a pas, dans le discours produit, l’équivalent d’un drive partagé avec permissions par dossier client.</p>
        <p>Reflect affiche un plan unique sur sa page tarifaire. Nous ne recopions aucun montant: les pages de référence de ce répertoire évitent les chiffres qui bougent. Dites « un plan, voir reflect.app ». Produit payant, avec essai selon ce que le site montre au moment de l’inscription. Pas de palier gratuit durable du type freemium documenté ici.</p>
        <p>Pour un opérateur francophone en SEA, Reflect peut devenir le carnet de bord des décisions: ce que le client a dit sur LINE, ce qui a été tranché en visio, le positionnement qu’on ne veut pas réinventer à chaque pitch. À condition de ne pas y verser les pièces d’identité des voyageurs ni les fichiers paie.</p>
      </div>
    </section>
    <section>
      <h2>Ce que le site officiel décrit</h2>
      <div class="card">
        <ul>
          <li>Notes quotidiennes et backlinks pour un graphe personnel</li>
          <li>Chiffrement de bout en bout déclaré pour le contenu des notes</li>
          <li>Clipper web, synchro multi-appareils, application iOS</li>
          <li>Liaison calendrier Google ou Outlook pour le contexte de réunion</li>
          <li>Reflect AI: l’éditeur cite GPT-4 et Whisper (OpenAI) pour reformuler, résumer, transcrire</li>
        </ul>
        <p>Les fonctions exactes d’IA (chat sur une sélection, prompts enregistrés, transcription mobile) évoluent. Relisez la page produit et le journal des mises à jour plutôt qu’un comparatif daté.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Pour qui c’est fait</h2>
        <div class="card">
          <ul>
            <li>Un stratège ou un créatif qui veut un second cerveau personnel</li>
            <li>Quelqu’un qui relie réunions, briefs et idées sans wiki d’équipe</li>
            <li>Un usage quotidien journal + liens, pas une GED client</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Ce que ce n’est pas</h2>
        <div class="card">
          <ul>
            <li>Pas le wiki ou le drive de l’agence</li>
            <li>Pas un endroit sûr pour dossiers clients sans politique écrite</li>
            <li>L’IA sort du périmètre chiffré dès que vous envoyez un extrait</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Second cerveau perso, pas mémoire de l’agence</h2>
      <div class="card">
        <p>Les petites structures de Vientiane, Bangkok ou Hô Chi Minh-Ville perdent le contexte dans LINE, WhatsApp et des notes téléphone. Reflect aide une personne — pas tout le bureau — à recoller ce fil: note du jour, lien vers le nom du client, lien vers le canal, lien vers la décision. Quand arrive le moment d’écrire un case ou un devis, on cherche dans son graphe. On n’attend pas que toute l’équipe adopte le même outil. Si vous avez besoin d’un playbook partagé, Google Docs, Notion ou le wiki interne restent plus honnêtes. Reflect n’est pas conçu comme une salle de rédaction collective.</p>
        <p>Le chiffrement de bout en bout, tel que déclaré, réduit l’intérêt d’une IA d’entreprise qui lirait toutes les notes pour tous les sièges. C’est cohérent avec un carnet personnel. Cela veut aussi dire: pas de recherche sémantique « pour la boîte entière », pas de assistant RH sur le graphe commun. Si vous activez Reflect AI, vous acceptez qu’un passage choisi quitte ce coffre vers OpenAI (et d’éventuelles autres API listées dans leur politique). Ne sélectionnez pas un paragraphe qui contient un numéro de passeport, une maladie, ou la grille tarifaire non publique d’un hôtel.</p>
        <p>Politique interne minimale avant d’y mettre quoi que ce soit de client: ce qui a le droit d’exister dans un carnet perso (décisions, formulations, to-do), ce qui reste dans le drive à accès limité (contrats, briefs complets, créas finales), et l’interdiction d’activer l’IA sur le second. Sans cette règle, un outil « privé » devient une fuite élégante. Cette revue n’est pas un avis RGPD ou de droit lao: parlez à votre conseil si vous traitez des données sensibles.</p>
        <p>Le calendrier Google ou Outlook sert à ouvrir une note de réunion le jour J. Utile. Ça ne remplace pas le compte-rendu envoyé au client. Transcrivez éventuellement avec Whisper selon ce que l’app propose, puis corrigez les noms propres lao et thaï: les toponymes et les marques locales se déforment. N’envoyez pas la transcription brute au client.</p>
        <p>Le clipper est bon pour garder un article concurrent ou une pub Facebook, pas pour archiver un site entier. Le résumé automatique d’une page thaïe ou vietnamienne peut couper l’avertissement légal ou le prix. Ouvrez la source avant de recycler l’idée dans un pitch. Pareil pour un article en français trouvé depuis un bureau à Vientiane: la source compte plus que la phrase lisse de l’IA.</p>
        <p>N’importez pas dix ans de notes le premier soir. Le graphe devient du bruit. Tenez deux semaines sur les vrais briefs, avec un lien client dès la première ligne. Ensuite seulement, ramenez les archives utiles. Si la recherche ne retrouve pas un nom transcrit de trois façons (Vientiane, Vieng Chan, et la graphie lao locale), normalisez vous-même le nom pivot dans la note maître.</p>
        <p>Partager une note par lien, si le produit l’offre encore au moment où vous lisez, n’est pas un canal de livraison client. Un lien qui fuit dans un groupe d’agences ne se reprend pas. Exportez un résumé relu, ou copiez dans l’e-mail. Gardez Reflect comme mémoire de travail.</p>
        <p>Si vous hésitez avec un autre carnet « IA d’abord » qui classe tout seul, posez-vous la question du contrôle: voulez-vous poser les liens à la main (Reflect) ou déléguer l’organisation au modèle? Pour former un junior, un graphe visible s’explique mieux. Pour une personne seule qui déteste les dossiers, un autre produit peut sembler plus léger. Choisissez selon la façon dont le responsable d’équipe vérifie le travail, pas selon un classement d’annuaire.</p>
      </div>
    </section>
    <section>
      <h2>Tarifs</h2>
      <div class="card">
        <p>Produit payant, un plan affiché. Nous ne recopions aucun montant. Conditions, essai et contenu du plan sur <a href="https://reflect.app" target="_blank" rel="noopener noreferrer">reflect.app</a>.</p>
      </div>
    </section>
    <section>
      <h2>Obtenir Reflect Notes</h2>
      ${visitFr('https://reflect.app')}
    </section>`,
  },
  {
    rel: 'fr/resources/ai-tools/amplitude-ai/index.html',
    meta: 'Revue Amplitude pour produits et e-commerce SEA: événements, tunnels, rétention. Analyses assistées dans la suite, à vérifier sur amplitude.com. Pas un GA de site vitrine.',
    lead: 'Amplitude est une analytique produit: événements, tunnels, rétention, cohortes. L’IA n’invente pas une métrique métier. Sans plan d’événements, l’outil pèse trop pour une simple vitrine.',
    sections: `
    <section>
      <h2>Qu’est-ce qu’Amplitude&nbsp;?</h2>
      <div class="card">
        <p><a href="https://amplitude.com" target="_blank" rel="noopener noreferrer">Amplitude</a> mesure ce que les gens font dans un produit numérique: ils ouvrent un écran, ajoutent au panier, terminent un onboarding, reviennent dans la semaine. On instrumente des événements, on construit des tunnels, on lit la rétention, on segmente des cohortes. Ce n’est pas Google Analytics branché sur un site vitrine de dix pages pour un cabinet à Vientiane. Si votre question est « d’où vient le trafic de la page Contact », un outil de site suffit souvent. Amplitude commence à payer quand il existe un parcours répété dans une app ou un e-commerce, et quelqu’un pour en lire les graphes.</p>
        <p>La suite Amplitude documente aussi des aides à l’analyse: formulations qui ont porté des noms différents selon les années (Intelligence, assistants, notebooks qui mêlent texte et graphiques). Nous n’en figeons aucun nom marketing. Dites: analyses assistées dans la suite Amplitude, à vérifier sur amplitude.com. Ces aides commentent des courbes ou accélèrent une question. Elles ne créent pas une définition de « client actif » à votre place. Si vous n’avez pas décidé quel événement compte comme une réservation ou un achat, le modèle n’inventera pas une vérité terrain.</p>
        <p>Amplitude propose historiquement un palier d’entrée gratuit ou limité, puis des plans payants selon le volume d’événements et les modules (replay de session, expérimentation, activation — selon ce que votre fiche produit affiche). Freemium dans ce répertoire. Aucun seuil chiffré ici: le volume d’une app thaïlandaise et celui d’un SaaS américain ne se comparent pas sur un article.</p>
        <p>Installer le SDK ou le pixel n’est pas « avoir de l’analytique produit ». Sans dictionnaire d’événements (nom, propriétés, qui a le droit d’en ajouter), vous obtiendrez des graphes propres et des décisions fausses. C’est le piège le plus fréquent des petites équipes qui copient un plan d’événements américain sur un checkout local avec contre-remboursement et paiement en boutique.</p>
        <p>Pour un opérateur francophone qui gère une app ou une boutique livrant Bangkok et Hô Chi Minh-Ville, Amplitude sert à voir où le parcours casse — pas à décorer un comité avec un score d’IA. Si personne ne se connecte chaque semaine, désabonnez-vous et gardez un tableau plus simple.</p>
      </div>
    </section>
    <section>
      <h2>Ce que la documentation produit couvre</h2>
      <div class="card">
        <ul>
          <li>Suivi d’événements et propriétés utilisateur / événement</li>
          <li>Tunnels de conversion et analyses de rétention</li>
          <li>Cohortes réutilisables sur plusieurs graphiques</li>
          <li>Tableaux de bord et notebooks pour raconter une analyse à l’équipe</li>
          <li>Analyses assistées dans la suite Amplitude — détail et nom actuel sur amplitude.com</li>
        </ul>
        <p>D’autres briques (replay, expérimentation) existent dans l’écosystème Amplitude selon les plans. Ne les promettez pas dans un devis tant que la page produit de votre compte ne les montre pas.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Quand c’est pertinent</h2>
        <div class="card">
          <ul>
            <li>App ou e-commerce avec un plan d’événements déjà discuté</li>
            <li>Équipe qui regardera un tunnel chaque semaine, pas une fois par trimestre</li>
            <li>Questions du type « qui revient » plutôt que « combien de sessions site »</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Quand c’est trop lourd</h2>
        <div class="card">
          <ul>
            <li>Site vitrine hôtel / agence sans parcours produit</li>
            <li>Personne n’a le temps de gouverner les noms d’événements</li>
            <li>On attend de l’IA qu’elle invente le KPI du métier</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>SEA: d’abord le plan d’événements, ensuite l’outil</h2>
      <div class="card">
        <p>Une boutique qui vend depuis Hô Chi Minh-Ville vers le pays et l’export n’a pas le même tunnel qu’une app de productivité américaine. Paiement à la livraison, transfert bancaire, ligne WhatsApp pour confirmer la commande: si ces étapes ne sont pas des événements, Amplitude vous dira que tout le monde abandonne au checkout alors que la vente se termine ailleurs. Avant d’acheter des sièges, dressez la liste: vue produit, ajout panier, choix du mode de paiement, confirmation, livraison, retour. Branchez ensuite seulement ce qui existe vraiment dans le code ou via le tag manager.</p>
        <p>Pour un hôtel, le « produit » n’est souvent pas le site. La réservation passe par OTA, téléphone, LINE. Amplitude sur la vitrine mesurera des clics de galerie, pas l’occupation. Dans ce cas, Search Console, le moteur de résa et le PMS restent plus proches du métier. Réservez Amplitude aux équipes qui ont une app de fidélité, un parcours de check-in, ou un e-commerce de circuits avec un vrai compte utilisateur.</p>
        <p>Les analyses assistées peuvent proposer une lecture d’une baisse de rétention. Relisez-la comme une hypothèse. Une chute en avril à Bangkok peut être Songkran, pas un bug. Une baisse à Vientiane peut être une coupure réseau ou un jour férié. Le modèle n’a pas le calendrier local dans les os. Annotez les graphiques dans un notebook avec les événements métier (campagne TikTok, rupture de stock, nouveau tarif). Sans ces notes, l’équipe poursuivra une « insight » qui n’en est pas une.</p>
        <p>Ne demandez pas à l’IA de définir « un lead qualifié » ou « un client fidèle ». Ces mots appartiennent à la vente. Amplitude peut compter les gens qui ont fait l’événement que vous avez nommé ainsi. Si le nom est faux, le chiffre est faux. C’est la même discipline qu’un bon plan de taggage, avec une interface plus riche.</p>
        <p>Côté vie privée, un SDK dans une app thaïlandaise ou vietnamienne collecte des comportements. Alignez-vous sur votre politique déjà publiée et sur ce que votre conseil indique pour le pays. N’envoyez pas de pièces d’identité dans les propriétés d’événement. Cette page ne remplace pas un DPO.</p>
        <p>Comparez le coût (volume d’événements, temps d’instrumentation) au rythme de décision. Si le fondateur ouvre Amplitude uniquement avant un board, un export hebdo depuis un outil plus simple suffit. Si un product manager et un marketeur tranchent chaque lundi sur un écran d’onboarding, le tunnel devient un outil de travail. L’IA n’accélère que la lecture, pas l’instrumentation initiale, qui reste le gros du projet.</p>
        <p>Pour les campagnes Facebook / LINE, Amplitude n’est pas le pixel pub. Gardez les plateformes média pour l’attribution approximative des campagnes, et Amplitude pour le comportement après l’install ou après la première visite authentifiée. Mélanger les deux sans identifiant commun produit des réunions où tout le monde a raison sur des chiffres différents. Décidez d’une clé de jointure (ou acceptez que les mondes restent séparés) avant d’acheter les deux piles.</p>
        <p>Un test d’entrée honnête: écrivez trois questions que vous voulez poser dans un mois (« quel pourcentage termine le paiement QR? », « les utilisateurs iOS reviennent-ils à J+7? », « le nouvel écran d’adresse fait-il baisser l’abandon? »). Si vous ne pouvez pas nommer les événements correspondants, n’installez pas Amplitude cette semaine. Revenez quand le plan tient sur une page. L’outil est bon; il ne remplace pas cette page.</p>
      </div>
    </section>
    <section>
      <h2>Tarifs</h2>
      <div class="card">
        <p>Freemium selon le répertoire. Volumes, modules et essais se lisent sur <a href="https://amplitude.com" target="_blank" rel="noopener noreferrer">amplitude.com</a>. Aucun prix recopié.</p>
      </div>
    </section>
    <section>
      <h2>Obtenir Amplitude</h2>
      ${visitFr('https://amplitude.com')}
    </section>`,
  },
  {
    rel: 'fr/resources/ai-tools/perplexity/index.html',
    meta: 'Revue Perplexity pour la veille SEA: réponses avec citations, recherche Pro, espaces selon l’offre actuelle. Sources à ouvrir. Pas un texte juridique à coller tel quel.',
    lead: 'Perplexity est un moteur de réponses sourcées, pas une encyclopédie locale. Utile pour une veille concurrentielle en anglais. Les citations peuvent être incomplètes; les sources lao sont rares.',
    sections: `
    <section>
      <h2>Qu’est-ce que Perplexity&nbsp;?</h2>
      <div class="card">
        <p><a href="https://www.perplexity.ai" target="_blank" rel="noopener noreferrer">Perplexity</a> répond à une question par un texte court et des liens vers des pages qu’il a consultées. Ce n’est pas une liste bleue à la Google, et ce n’est pas un chat sans source. L’intérêt marketing est de gagner du temps sur une veille: « que dit ce concurrent sur ses tarifs publics », « quelles pages parlent de tel visa », « quel article récent relie telle tendance ». L’intérêt disparaît si vous collez la réponse dans une page légale, un contrat ou une FAQ médicale sans ouvrir les URL.</p>
        <p>L’offre gratuite permet déjà de poser des questions. Les plans payants, dont un niveau Pro documenté par Perplexity, augmentent l’accès à une recherche plus approfondie (souvent appelée Pro Search) et à des modèles plus variés. Les noms de modes (recherche, raisonnement, recherche longue) et les quotas changent. Lisez perplexity.ai. Nous ne recopions ni prix ni nombre de requêtes.</p>
        <p>Pour organiser le travail, Perplexity a proposé des collections, des espaces, parfois relabelisés projets selon les versions de l’aide. L’idée reste: un dossier persistant, éventuellement des fichiers, des instructions, un partage d’équipe. Vérifiez le nom et les droits dans votre compte plutôt que de figer un vocabulaire d’article. N’y déposez pas de briefs clients confidentiels si vous n’avez pas lu les options d’exclusion d’entraînement et le plan (Perso, Pro, offre organisation) réellement souscrit.</p>
        <p>Le moteur est à l’aise sur le web anglophone et sur les sources bien indexées. Sur le lao, le vivier de pages fiables est mince. Une réponse sur une règle locale au Laos peut s’appuyer sur un forum, un blog de voyage ou une page datée. Ouvrez la source. Si la source est absente ou hors sujet, la phrase lisse ne vaut rien. Le thaï et le vietnamien sont mieux représentés que le lao, sans être à l’abri d’erreurs de noms propres et de dates.</p>
        <p>Perplexity n’est pas votre CMS, pas votre outil de citation académique, et pas un avocat. C’est un accélérateur de lecture, à condition que la lecture ait encore lieu.</p>
      </div>
    </section>
    <section>
      <h2>Ce que l’offre actuelle met en avant</h2>
      <div class="card">
        <ul>
          <li>Réponses avec citations cliquables vers des pages web</li>
          <li>Recherche Pro / modes approfondis selon le plan, décrits dans l’aide Perplexity</li>
          <li>Collections, espaces ou projets — le nom actuel se vérifie dans l’interface</li>
          <li>Applications web et mobiles listées sur les stores officiels</li>
          <li>Choix de modèles sur les plans payants, liste évolutive côté éditeur</li>
        </ul>
        <p>D’autres surfaces (navigateur, modes expérimentaux) apparaissent dans leur communication. Ne les tenez pour acquis dans un process d’agence qu’après les avoir vus dans votre compte.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Usages raisonnables</h2>
        <div class="card">
          <ul>
            <li>Veille concurrentielle sourcée en anglais, puis ouverture des liens</li>
            <li>Repérage d’articles récents avant un atelier client</li>
            <li>Comparer deux explications et aller à la source la plus proche du régulateur</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Limites à garder en tête</h2>
        <div class="card">
          <ul>
            <li>Citations incomplètes, mal classées ou trop anciennes</li>
            <li>Peu de sources lao solides; le local se vérifie ailleurs</li>
            <li>Interdit de coller une réponse dans une page juridique ou un tarif officiel</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Veille SEA: sourcer, ne pas republier</h2>
      <div class="card">
        <p>Un marketeur à Bangkok qui prépare un pitch tourisme peut demander à Perplexity ce que les médias anglais ont écrit sur une saison, une compagnie aérienne ou un concurrent. Il obtient une synthèse et des liens. Le travail réel commence ensuite: ouvrir trois sources, noter la date, vérifier si l’article parle de la Thaïlande ou d’un autre pays, et écrire le paragraphe du pitch avec vos mots. Si vous publiez la synthèse telle quelle sur le blog de l’agence, vous republiez éventuellement des erreurs et vous n’avez aucune voix.</p>
        <p>Pour le Laos, partez du principe que le moteur sous-échantillonne. Une question sur une licence, une taxe ou un jour férié doit aboutir à un site d’autorité local ou à votre conseil, pas à une phrase Perplexity. Servez-vous de l’outil pour trouver des pistes en anglais (« comment tel sujet est discuté à l’étranger »), puis confrontez avec un locuteur et une source lao. Les toponymes se déforment; les chiffres de fréquentation touristique circulent sans année. Aucune de ces phrases ne doit entrer dans une brochure.</p>
        <p>Les citations peuvent omettre la page qui contredit le résumé, ou citer un communiqué recopié vingt fois. Cliquez. Si deux liens pointent vers le même article syndiqué, vous n’avez pas deux sources. Pour une veille concurrentielle, préférez le site du concurrent, un dépôt officiel, un article signé. Un agrégateur anonyme en bas de liste n’est pas une preuve.</p>
        <p>Ne collez jamais une réponse Perplexity dans les CGV, une page « visa », une mention de prix, ou un argumentaire santé. Même avec des liens, le texte généré mélange parfois des juridictions. Un voyageur qui lit votre site à Vientiane prendra la phrase pour la règle. La correction après coup coûte plus cher que le temps de rédaction humaine.</p>
        <p>Les espaces ou projets aident à garder une veille « concurrent hôtel Luang Prabang » sans refaire la question chaque lundi. Mettez-y des instructions du type: toujours afficher l’année, ne pas inventer de tarif, répondre en français de travail. N’y chargez pas le contrat client. Si vous êtes plusieurs, regardez qui peut voir les fichiers. Une offre perso n’est pas un espace juridique d’agence.</p>
        <p>En vietnamien ou en thaï, testez le moteur sur des questions dont vous connaissez déjà la réponse. Vous verrez vite s’il invente un nom de ministère ou un chiffre. Gardez Perplexity pour l’anglais de veille internationale, et vos rédacteurs locaux pour les pages qui convertissent. Ce partage est plus honnête qu’un « on fait tout dans un seul chat ».</p>
        <p>Côté conformité interne: une requête qui contient le nom d’un prospect et le détail d’une négociation n’a rien à faire dans un moteur grand public. Reformulez de façon générique. Lisez les réglages d’historique et d’entraînement du plan. Cette revue ne décrit pas votre obligation légale; elle décrit une hygiène minimale d’agence.</p>
        <p>Un rituel simple: une question Perplexity, trois sources ouvertes, cinq lignes dans votre carnet de veille, zéro copier-coller vers le site. Si le rituel saute la case sources, l’outil vous fait perdre du temps en confiance mal placée. S’il la respecte, vous arrivez en réunion avec des liens, pas avec une impression. C’est tout ce qu’on peut lui demander sans hype.</p>
      </div>
    </section>
    <section>
      <h2>Tarifs</h2>
      <div class="card">
        <p>Freemium: usage gratuit limité et plans payants (dont Pro). Aucun prix recopié. Offre et modes de recherche sur <a href="https://www.perplexity.ai" target="_blank" rel="noopener noreferrer">perplexity.ai</a>.</p>
      </div>
    </section>
    <section>
      <h2>Obtenir Perplexity</h2>
      ${visitFr('https://www.perplexity.ai')}
    </section>`,
  },
];
