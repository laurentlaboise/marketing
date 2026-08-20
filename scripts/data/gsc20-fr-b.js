'use strict';

/**
 * French handwritten reviews — Midjourney, Framer AI, HeyGen, Mailchimp, LongShot AI.
 * Official-site facts only. No invented prices, rankings, or user counts.
 */

const visitFr = (href) => `<div class="cta-bar">
        <a class="btn btn-primary" href="${href}" target="_blank" rel="noopener noreferrer"><i class="fas fa-globe"></i> Visiter le site web</a>
      </div>`;

module.exports = [
  {
    rel: 'fr/resources/ai-tools/midjourney/index.html',
    meta: 'Revue Midjourney pour les PME SEA: générateur texte vers image via Discord et l’app web, utile pour moodboards hôtel ou resto, pas pour une pub photo d’un lieu réel. Vérifiez plans et licences sur midjourney.com.',
    lead: 'Midjourney génère des images à partir d’un texte, depuis Discord et depuis l’application web documentée sur midjourney.com. Le rendu est souvent cinématographique: c’est un positionnement visuel, pas un classement, et ce n’est pas une photo du vrai établissement.',
    sections: `
    <section>
      <h2>Qu’est-ce que Midjourney&nbsp;?</h2>
      <div class="card">
        <p><a href="https://www.midjourney.com" target="_blank" rel="noopener noreferrer">Midjourney</a> est un service de génération d’images à partir d’un prompt texte. L’éditeur documente deux portes d’entrée: le bot sur Discord, historique du produit, et l’application web sur midjourney.com, avec une page de création, une organisation de galerie et un éditeur pour retravailler une image déjà générée. La documentation officielle compare ces deux interfaces et indique qu’un abonnement peut servir des deux côtés une fois les comptes liés.</p>
        <p>Le style visuel qui circule autour de Midjourney — lumière de film, composition soignée, textures riches — décrit un positionnement esthétique, pas un trophée indépendant. Nous n’en faisons pas un «&nbsp;meilleur générateur&nbsp;». D’autres outils produisent aussi des visuels utiles. Midjourney reste un moteur d’image: il n’héberge pas votre site, n’envoie pas vos campagnes et ne remplace pas un photographe sur place à Luang Prabang ou à Chiang Mai.</p>
        <p>Le répertoire WordsThatSells le classe comme offre payante. Historiquement, l’usage a exigé un plan payant. Les paliers, minutes GPU et options de confidentialité changent. Nous n’inventons aucun tarif ici. Ouvrez la page d’abonnement sur <a href="https://www.midjourney.com" target="_blank" rel="noopener noreferrer">midjourney.com</a> avant d’inscrire une ligne dans un devis client.</p>
        <p>Les droits d’usage commercial, la licence sur les prompts et le statut des images remixées figurent dans les conditions officielles, pas dans un résumé d’agence. Pour une PME qui veut illustrer une landing ou un menu, lisez les <a href="https://docs.midjourney.com/hc/en-us/articles/32083055291277-Terms-of-Service" target="_blank" rel="noopener noreferrer">Terms of Service</a> et la page sur l’usage commercial avant de livrer un fichier au client. Midjourney précise aussi qu’il ne donne pas de conseil juridique sur le droit d’auteur, qui varie selon les pays.</p>
        <p>Pour une équipe à Vientiane, Bangkok ou Hô Chi Minh-Ville, l’usage raisonnable est le moodboard et l’exploration de style — pas la preuve qu’une chambre, une terrasse ou un plat existent tels quels. Si l’annonce vend un lieu réel, il faut une photo réelle, un droit d’image, et une légende qui ne ment pas.</p>
      </div>
    </section>
    <section>
      <h2>Ce que la doc produit décrit</h2>
      <div class="card">
        <ul>
          <li>Génération texte vers image depuis Discord et depuis le site web, avec le même abonnement une fois les comptes connectés</li>
          <li>Paramètres de création (cadrage, stylisation, références d’image ou de style) documentés des deux côtés, avec une interface plus visuelle sur le web</li>
          <li>Éditeur web pour modifier une zone, varier une région ou retravailler une création déjà générée</li>
          <li>Galerie et outils d’organisation sur midjourney.com pour retrouver prompts et fichiers</li>
          <li>Mode conversationnel sur le web, présenté comme capable d’aider à formuler un prompt, y compris dans d’autres langues que l’anglais — à tester, pas à croire sur parole</li>
        </ul>
        <p>Les noms de modèles, les commandes Discord et les fonctions exclusives au web évoluent. Relisez la doc Midjourney le jour où vous formez un stagiaire, plutôt qu’un tutoriel daté.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Bon usage pour une PME</h2>
        <div class="card">
          <ul>
            <li>Moodboards d’ambiance pour un hôtel, un resto ou une villa avant le shooting</li>
            <li>Exploration de palettes et de cadrages pour une campagne, puis brief photo réel</li>
            <li>Visuels conceptuels internes, clairement marqués comme illustrations générées</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Limites honnêtes</h2>
        <div class="card">
          <ul>
            <li>Le texte thaï, lao ou français dans l’image est souvent faux, inversé ou illisible</li>
            <li>Ce n’est pas une photo du vrai lieu: interdite comme preuve dans une pub d’établissement</li>
            <li>Licences et usage commercial: uniquement les terms officielles, pas un «&nbsp;on peut tout vendre&nbsp;»</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Angle marketing en Asie du Sud-Est</h2>
      <div class="card">
        <p>Un hôtel boutique à Vientiane qui prépare une saison peut demander à Midjourney des ambiances: lumière de fin d’après-midi sur une terrasse, linge clair, bol de café. Ces planches aident le propriétaire et le photographe à se mettre d’accord. Elles ne remplacent pas la chambre 203 ni la vue réelle sur le Mékong. Si vous publiez l’image générée dans une pub Facebook ou un catalogue OTA, dites qu’il s’agit d’une illustration. Un client qui arrive et ne reconnaît pas le lieu vous le fera payer en avis.</p>
        <p>Un restaurant à Bangkok ou un café à Hô Chi Minh-Ville a le même piège sur les plats. Midjourney invente des textures séduisantes. Le pad thaï, le larb ou le bánh mì générés ne sont pas le plat du jour. Pour une offre «&nbsp;menu du soir&nbsp;», photographiez l’assiette. Gardez Midjourney pour le mood de la salle, le style de la carte, ou une affiche clairement fictionnelle.</p>
        <p>Le texte incrusté est le point faible le plus coûteux. Demander «&nbsp;enseigne en thaï&nbsp;» ou «&nbsp;menu en français&nbsp;» produit souvent des glyphes inventés, des accents cassés, un mot à l’envers. Ne livrez jamais une créa avec du lettrage généré sans le recouvrir dans un outil de mise en page. Composez le titre en thaï, en lao ou en français dans Canva, Figma ou InDesign, sur une image sans texte. C’est plus lent d’un quart d’heure et cela évite une faute publique.</p>
        <p>Les campagnes SEA passent surtout par Facebook, Instagram, LINE et parfois WhatsApp. Une image large et cinématographique peut servir de fond d’histoire. Elle ne suffit pas: le bouton, le prix en kip, baht ou dong, et le lien vers une landing ou un numéro WhatsApp restent à construire ailleurs. Midjourney n’envoie rien. Il sort un fichier.</p>
        <p>Côté conformité, un visage généré qui ressemble à une personne réelle, un logo de marque tierce ou un temple utilisé comme décor «&nbsp;exotique&nbsp;» peuvent créer un conflit. Les conditions Midjourney et le droit local ne sont pas la même chose. Au Laos, en Thaïlande et au Vietnam, une pub qui suggère un partenariat officiel ou un lieu sacré sans accord est un risque. En cas de doute, changez de prompt ou prenez une photo autorisée.</p>
        <p>Un flux de travail que nous recommandons aux petites équipes: brief écrit (offre, public, interdits) → 8 à 16 variations Midjourney pour le mood → choix de 2 directions avec le client → shooting ou retravail graphique → texte local relu par un humain → publication. N’inversez pas l’ordre. Si le client tombe amoureux d’une image impossible à photographier, vous aurez un brief toxique.</p>
        <p>Pour une agence qui facture au forfait, comptez le temps de prompting et de tri, pas seulement l’abonnement. Un junior peut brûler une session à relancer le même prompt. Fixez un plafond d’essais et un critère d’arrêt: «&nbsp;on a deux ambiances exploitables&nbsp;». Archivez le prompt exact avec le fichier livré, au cas où le client redemande la même série six mois plus tard — les modèles changent et le même texte ne redonne pas la même image.</p>
        <p>Si vous n’avez besoin que d’une icône, d’un fond abstrait ou d’un schéma, un autre générateur ou une banque d’images sous licence peut suffire. Midjourney justifie surtout les recherches d’ambiance lourdes. Ce n’est pas l’outil à ouvrir pour corriger un JPEG de menu ou détourer un plat. Gardez-le dans la case «&nbsp;exploration visuelle&nbsp;», à côté de la photo réelle et du graphiste qui pose le texte.</p>
      </div>
    </section>
    <section>
      <h2>Tarifs</h2>
      <div class="card">
        <p>Le répertoire indique un modèle payant. Midjourney a historiquement exigé un abonnement pour générer. Nous ne recopions aucun palier ni aucun prix: ils bougent. Vérifiez l’offre actuelle, les minutes, la confidentialité et les droits d’usage sur <a href="https://www.midjourney.com" target="_blank" rel="noopener noreferrer">midjourney.com</a> et dans les terms officielles. Aucun chiffre de cette page ne remplace cette lecture.</p>
      </div>
    </section>
    <section>
      <h2>Obtenir Midjourney</h2>
      ${visitFr('https://www.midjourney.com')}
    </section>`,
  },
  {
    rel: 'fr/resources/ai-tools/framer-ai/index.html',
    meta: 'Revue Framer pour les PME SEA: constructeur no-code avec génération de site par IA, CMS, localisation et hébergement. Plus proche d’une landing campagne que d’un ERP. Vérifiez domaine custom et tarifs sur framer.com.',
    lead: 'Framer est un constructeur de sites no-code: l’IA y génère des pages éditables, avec CMS, localisation et hébergement Framer. C’est un outil de landing et de site marketing, pas un ERP ni un back-office métier.',
    sections: `
    <section>
      <h2>Qu’est-ce que Framer&nbsp;?</h2>
      <div class="card">
        <p><a href="https://www.framer.com" target="_blank" rel="noopener noreferrer">Framer</a> se présente comme un constructeur de sites et, plus récemment, comme un agent de design qui travaille sur le canevas. La page <a href="https://www.framer.com/ai/" target="_blank" rel="noopener noreferrer">Framer AI</a> décrit un flux simple: vous décrivez le site ou la mise à jour; l’agent crée des pages, des sections, du texte et des visuels éditables; vous reprenez la main sur le canevas à tout moment. Ce n’est pas une image figée ni un thème verrouillé.</p>
        <p>Autour de cette génération, Framer documente une pile de site marketing: CMS, localisation, hébergement, réglages SEO, redirections, analytique, branches de collaboration. Vous pouvez partir d’un prompt, puis publier sur l’infrastructure Framer. L’éditeur visuel reste le centre: typographie, composants, points de rupture, espacements, couleurs. L’IA accélère; elle ne retire pas la responsabilité de relire le français, le thaï ou le lao.</p>
        <p>Le produit est plus proche d’un outil de landing et de site vitrine que d’un ERP. Il ne remplace pas un logiciel de stock, une caisse, un CRM hôtelier ou une comptabilité. Si votre client a besoin de réserver des chambres, de facturer en kip et de gérer des stocks, Framer peut porter la page de campagne — le métier reste ailleurs.</p>
        <p>Pour une PME ou une agence à Vientiane, Bangkok ou Hô Chi Minh-Ville, l’intérêt typique est une landing de campagne Facebook / LINE, un site one-page d’hôtel boutique, ou un microsite d’événement. Le répertoire le classe en freemium: le site propose de commencer gratuitement, et des plans payants existent. Le domaine personnalisé, les limites de CMS et les options d’équipe dépendent du plan. Vérifiez la grille actuelle sur framer.com, sans copier un tarif lu sur un blog.</p>
        <p>Framer documente aussi une localisation: plusieurs locales, contenus adaptés par langue et par région. C’est utile pour un site FR / EN / TH. Ce n’est pas une traduction magique prête à publier. Un agent peut proposer du texte; un humain qui parle la langue du marché doit le signer.</p>
      </div>
    </section>
    <section>
      <h2>Ce que Framer documente</h2>
      <div class="card">
        <ul>
          <li>Génération de pages éditables à partir d’un prompt, puis refinement sur le canevas</li>
          <li>CMS pour collections et contenus dynamiques, avec un agent qui peut aider à structurer ou mettre à jour</li>
          <li>Localisation pour plusieurs langues et régions, documentée dans l’Academy Framer</li>
          <li>Hébergement Framer, publication, et outils SEO (titre, description, aperçu social) à renseigner dans le projet</li>
          <li>Analytique et, selon l’offre du moment, tests ou agents pour relire contrastes, textes alt et trous SEO — à valider dans le compte, pas à considérer comme un audit juridique</li>
        </ul>
        <p>Les noms d’agents, les modèles proposés et les droits inclus dans le plan gratuit changent. Relisez pricing et docs le jour du brief, pas la fiche d’il y a six mois.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Bon usage pour une PME</h2>
        <div class="card">
          <ul>
            <li>Landings de campagne ads, événement ou lancement d’offre</li>
            <li>Site vitrine court (hôtel, resto, studio) quand le besoin n’est pas un catalogue ERP</li>
            <li>Prototype rapide à montrer au client avant un site plus lourd</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Limites honnêtes</h2>
        <div class="card">
          <ul>
            <li>SEO et balises meta: à régler soi-même; l’IA peut suggérer, elle ne garantit pas le crawl</li>
            <li>Texte lao, thaï ou français généré: à relire; les tons et noms propres cassent facilement</li>
            <li>Domaine custom selon le plan — vérifier sur framer.com avant de promettre un nom de domaine au client</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Landings de campagne en Asie du Sud-Est</h2>
      <div class="card">
        <p>Une agence qui achète du trafic Facebook depuis Bangkok vers une villa à Vang Vieng a besoin d’une page qui charge sur un téléphone en 3G, avec un prix clair, un bouton WhatsApp ou LINE, et des photos réelles des chambres. Framer peut sortir une structure en une session. Le travail utile commence après: remplacer les images de stock générées, écrire le français ou le thaï que le client dirait vraiment, et tester le scroll sur un Android entrée de gamme. Une animation lourde qui impressionne sur fibre à l’agence peut rater la conversion dans une province.</p>
        <p>Réglez titre, meta description et image sociale vous-même. Framer expose ces champs; il ne les remplit pas de façon fiable pour le marché lao. Un titre en anglais générique («&nbsp;Luxury Stay in Laos&nbsp;») alors que l’annonce cible des familles thaïlandaises est un gaspillage de clic. Alignez la langue de l’annonce, de la landing et du message de suivi. Si l’IA a écrit trois locales, ouvrez chaque locale comme un livrable séparé, pas comme une case cochée.</p>
        <p>La performance mobile n’est pas un score de démo. Mesurez le premier écran utile sur le réseau que vos clients utilisent. Désactivez les vidéos autoplay, compressez les images, et évitez d’empiler des composants communautaires non testés. Framer communique sur l’hébergement et les Core Web Vitals; votre page particulière peut quand même être lente si vous y collez trop d’effets. Un test réel bat une capture d’écran marketing.</p>
        <p>Le lao et le thaï demandent des polices qui tiennent les voyelles et les tons. Une police latine élégante peut casser le rendu, couper des glyphes ou rendre le texte illisible. Vérifiez chaque breakpoint. Un menu hamburger qui mange la moitié de l’écran sur un Samsung courant est un défaut de livraison, pas un détail. Relisez aussi les formulaires: un champ «&nbsp;ZIP code&nbsp;» n’a aucun sens pour beaucoup de visiteurs SEA; demandez ville, WhatsApp ou LINE ID selon le canal de vente.</p>
        <p>Le domaine personnalisé dépend du plan. Ne promettez pas «&nbsp;votre nom de domaine dès demain&nbsp;» dans un devis si vous n’avez pas ouvert la page pricing et la doc domaines du jour. En attendant, une URL Framer peut servir à une recette interne. Pour une campagne payante, pointez vers le domaine du client dès que c’est contractuellement possible, avec HTTPS et une redirection propre. Un pixel et un événement de conversion se règlent ensuite; Framer n’est pas un gestionnaire de publicités.</p>
        <p>Côté pile, gardez Framer à la couche acquisition. Le devis, la réservation et la facture restent dans les outils que l’équipe sait déjà ouvrir. Brancher un formulaire vers une feuille ou un webhook est souvent suffisant. Vouloir transformer Framer en back-office de groupe hôtelier est le mauvais combat. Si le client a besoin d’un blog hebdomadaire en trois langues avec un calendrier éditorial lourd, testez le CMS Framer sur un pilote — et ayez un plan B si le flux d’approbation ne convient pas.</p>
        <p>Un rituel simple avant mise en ligne: 1) copier le brief dans l’agent et générer; 2) remplacer tout texte inventé (prix, visa, horaires, «&nbsp;meilleur hôtel&nbsp;»); 3) poser photos réelles et mentions légales; 4) relire FR / EN / TH / LO selon les locales actives; 5) tester 3G et un partage LINE; 6) vérifier meta et redirection. Si une étape saute, vous livrez une jolie maquette, pas une landing.</p>
        <p>Si vous n’avez ni designer ni quelqu’un pour relire les langues, Framer n’effacera pas ce manque. L’IA rend le premier jet plus vite. Elle n’empêche pas une faute de ton, un prix faux ou une page trop lourde. Traitez le premier jet comme un wireframe habillé, puis facturez la relecture et le réglage mobile comme le vrai travail.</p>
      </div>
    </section>
    <section>
      <h2>Tarifs</h2>
      <div class="card">
        <p>Le répertoire indique un modèle freemium. Framer propose un démarrage gratuit et des plans payants; le domaine custom, le CMS et les sièges d’équipe varient. Nous n’inscrivons aucun prix. Confirmez l’offre du jour sur <a href="https://www.framer.com" target="_blank" rel="noopener noreferrer">framer.com</a> et la page pricing avant de chiffrer un client.</p>
      </div>
    </section>
    <section>
      <h2>Obtenir Framer</h2>
      ${visitFr('https://www.framer.com')}
    </section>`,
  },
  {
    rel: 'fr/resources/ai-tools/heygen/index.html',
    meta: 'Revue HeyGen pour les équipes francophones en SEA: vidéo avatar, traduction avec lip-sync, jumeaux numériques et API. Utile pour explainers et formation interne, pas pour filmer un lieu réel. Vérifiez consentement et plans sur heygen.com.',
    lead: 'HeyGen produit des vidéos avec avatars, traduction et lip-sync, plus une API. C’est un studio d’explainers et de formation, pas une caméra pour montrer un hôtel ou un restaurant tels qu’ils sont.',
    sections: `
    <section>
      <h2>Qu’est-ce que HeyGen&nbsp;?</h2>
      <div class="card">
        <p><a href="https://www.heygen.com" target="_blank" rel="noopener noreferrer">HeyGen</a> se présente comme une plateforme de vidéo IA: vous partez d’un script, d’une image, d’un audio ou d’un avatar, et vous obtenez une vidéo montable dans un studio web. Le site met en avant des avatars (dont une génération appelée Avatar V), un alignement lèvres / parole, une traduction vidéo, et des flux texte vers vidéo, image vers vidéo ou diaporama vers vidéo. Un espace développeur et des API sont documentés pour industrialiser la génération.</p>
        <p>Le produit affiche un démarrage gratuit et des plans payants: modèle freemium selon le répertoire. Les minutes, watermarks, voix et droits d’avatar dépendent du compte. Nous ne recopions aucune grille. Ouvrez heygen.com le jour où vous chiffrez une série de modules de formation.</p>
        <p>HeyGen documente aussi une exigence de vérification d’identité pour un avatar personnalisé qui représente une personne: pas de vérification caméra, pas d’avatar. Les demandes de retrait sont présentées comme honorées. Pour une PME, cela veut dire: ne clonez pas le visage du directeur, d’un réceptionniste ou d’un influenceur sans un accord écrit et le parcours officiel de consentement. Un «&nbsp;on a juste utilisé une photo LinkedIn&nbsp;» n’est pas un process.</p>
        <p>Cette revue est rédigée pour des équipes francophones en Asie du Sud-Est. Elle ne reprend pas les exemples d’une fiche thaïe. Ici, les cas utiles sont un explainer en français pour une offre B2B, une formation interne bilingue, ou un hôtel qui doit expliquer check-in et navette en FR, EN et TH — pas un film de la piscine réelle.</p>
        <p>Un avatar qui parle n’est pas une preuve de lieu. Si vous vendez une vue, une chambre ou un buffet, filmez le lieu. HeyGen sert le discours, le sous-titre, la version traduite d’un module déjà validé. Mélanger les deux sans le dire au spectateur est une faute de pub, pas une astuce de croissance.</p>
      </div>
    </section>
    <section>
      <h2>Ce que le site annonce</h2>
      <div class="card">
        <ul>
          <li>Avatars parlants, avec lip-sync et, selon les pages produit, plusieurs angles à partir d’un enregistrement de référence</li>
          <li>Traduction vidéo avec conservation du ton et synchronisation labiale, le vendeur annonçant un large éventail de langues et dialectes — à tester sur vos paires FR / EN / TH, pas à croire comme un score indépendant</li>
          <li>Jumeaux numériques / avatars personnalisés, conditionnés par une vérification d’identité de la personne représentée</li>
          <li>API et offre développeur pour générer, traduire ou synchroniser des lèvres dans un flux applicatif</li>
          <li>Studio d’édition (script, voix, sous-titres, kit de marque) et conversion PPT ou PDF vers une vidéo commentée</li>
        </ul>
        <p>Les noms de modèles, le nombre de langues et les minutes du plan gratuit bougent. Relisez la FAQ et la page pricing du compte plutôt qu’un article de 2024.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Bon usage pour une PME</h2>
        <div class="card">
          <ul>
            <li>Explainers francophones pour une offre de service, une app ou une procédure</li>
            <li>Modules de formation interne (accueil, hygiène, script de vente) à mettre à jour sans refaire un plateau</li>
            <li>Version FR / EN / TH d’un même script hôtelier déjà validé, avec relecture native</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Limites honnêtes</h2>
        <div class="card">
          <ul>
            <li>Consentement visage obligatoire pour un jumeau: process officiel, pas une photo volée</li>
            <li>Ce n’est pas un film du lieu réel — interdite comme visite virtuelle d’un établissement</li>
            <li>La traduction lip-sync reste à faire écouter par un locuteur; les noms propres lao ou thaï cassent souvent</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Explainers francophones, formation et hôtel FR / EN / TH</h2>
      <div class="card">
        <p>Une société de services à Vientiane qui vend aussi aux sièges francophones peut enregistrer un script de six minutes: qui nous sommes, ce que le forfait inclut, comment on facture, comment on ouvre un ticket. Un avatar HeyGen lit ce script. Le gain n’est pas «&nbsp;plus humain que le fondateur&nbsp;». Le gain est de pouvoir corriger une phrase de prix sans reconvoquer toute l’équipe. Le fondateur reste plus crédible en visio client. L’avatar porte la FAQ répétitive.</p>
        <p>En formation interne, le cas le plus propre est un module qui change souvent: nouveau plat allergène, nouvelle consigne de transfert aéroport, nouveau script WhatsApp. Vous mettez à jour le texte, vous régénérez, vous republiez sur le drive ou le LMS. Les employés regardent ça sur leur téléphone. Vérifiez les sous-titres: un employé qui apprend en bruit de cuisine lira plus qu’il n’écoutera. Un sous-titre thaï généré avec un mot faux sur un allergène est un incident, pas un détail de style.</p>
        <p>Un hôtel qui accueille des francophones, des Thaïlandais et des clients internationaux peut partir d’un seul script validé par la réception: horaires de navette, dépôt, petit-déjeuner, ce qui n’est pas inclus. Puis produire trois vidéos avatar FR, EN, TH. Ce n’est pas une visite de la suite. Montrez les vraies photos à côté, ou renvoyez vers la galerie du site. Dites clairement que le visage à l’écran est un présentateur généré, surtout si vous utilisez un avatar de stock et non le vrai manager.</p>
        <p>Le consentement n’est pas une case marketing. Si vous clonez la responsable des ventes, obtenez un écrit: durée, canaux (site, ads, formation), droit de retrait, ce qui se passe si elle quitte l’entreprise. Passez par la vérification caméra que HeyGen exige pour un avatar custom. Ne créez pas un jumeau d’un partenaire, d’un moine, d’une célébrité locale ou d’un client. Au-delà des conditions du vendeur, le droit à l’image et les règles locales sur les deepfakes existent. En cas de doute, utilisez un avatar de bibliothèque clairement synthétique.</p>
        <p>Les campagnes SEA se partagent sur Facebook, LINE, TikTok et parfois YouTube. Un avatar trop «&nbsp;studio américain&nbsp;» peut paraître hors sol pour une audience lao. Testez dix secondes sur le canal réel avant de produire une série de vingt épisodes. La voix, le rythme et le tutoiement / vouvoiement en français doivent coller à la marque. HeyGen ne connaît pas votre charte. Un script trop vendu, trop d’emojis parlés, ou un «&nbsp;bonjour à tous les digital nomads&nbsp;» alors que vous parlez à des familles thaïes, et la vidéo coûte plus qu’elle ne rapporte.</p>
        <p>L’API intéresse une équipe qui a déjà un catalogue de scripts: générer des variantes, pousser une version traduite, ou brancher un outil interne. Ce n’est pas le premier pas d’un restaurant de quinze tables. Sans développeur, restez dans le studio web. Documentez le nom du modèle et les crédits consommés par minute exportée, pour que le budget formation ne dérive pas en silence.</p>
        <p>Qualité: faites relire chaque langue par quelqu’un qui la parle au quotidien. Le lip-sync peut être convaincant sur une phrase anglaise et faux sur un prénom lao. Les chiffres, les horaires et les mentions légales (alcool, âge, conditions d’annulation) ne se délèguent pas à la traduction automatique. Gardez une checklist papier à côté du script: si une donnée métier change, vous régénérez; vous ne «&nbsp;corrigez pas à l’oreille&nbsp;» dans un commentaire Facebook.</p>
        <p>Si votre besoin est une bande-annonce du lieu, une recette filmée ou un témoignage client, prenez une caméra. HeyGen n’ajoute pas de vérité terrain. Il ajoute de la parole reproductible. C’est déjà beaucoup pour une petite équipe qui n’a pas de monteur. Ce n’est pas un substitut à l’honnêteté visuelle d’une annonce d’hébergement.</p>
      </div>
    </section>
    <section>
      <h2>Tarifs</h2>
      <div class="card">
        <p>Le répertoire indique un modèle freemium. HeyGen documente un plan gratuit et des offres payantes; minutes, watermark, API et avatars custom varient. Aucun prix n’est recopié ici. Vérifiez l’offre du jour sur <a href="https://www.heygen.com" target="_blank" rel="noopener noreferrer">heygen.com</a> avant d’engager une série de vidéos.</p>
      </div>
    </section>
    <section>
      <h2>Obtenir HeyGen</h2>
      ${visitFr('https://www.heygen.com')}
    </section>`,
  },
  {
    rel: 'fr/resources/ai-tools/mailchimp/index.html',
    meta: 'Revue Intuit Mailchimp pour les PME SEA: e-mail, automations, landings et assistants de contenu génératif documentés. Suite marketing généraliste, pas seulement une newsletter créateur. Vérifiez consentement, PDPA et tarifs sur mailchimp.com.',
    lead: 'Intuit Mailchimp regroupe e-mail, automations, pages d’atterrissage et aides à la rédaction générative documentées par l’éditeur. C’est une suite marketing generaliste, pas un simple outil de newsletter pour créateurs.',
    sections: `
    <section>
      <h2>Qu’est-ce que Mailchimp&nbsp;?</h2>
      <div class="card">
        <p><a href="https://mailchimp.com" target="_blank" rel="noopener noreferrer">Mailchimp</a>, marque Intuit, se présente comme une plateforme d’e-mail et, selon les marchés, de SMS, avec analytics, automations et outils d’IA. Ce n’est pas seulement une boîte d’envoi pour une newsletter de créateur. Une PME peut y tenir une liste de contacts, segmenter, envoyer des campagnes, enchaîner des scénarios (bienvenue, panier, relance) et publier des landings reliées à l’audience.</p>
        <p>L’éditeur documente un <a href="https://mailchimp.com/features/landing-pages/" target="_blank" rel="noopener noreferrer">constructeur de landing pages</a>: modèles, glisser-déposer, pages pensées mobile, rapports de visites et de conversion, possibilité de relier un domaine. Il documente aussi des fonctions génératives et Intuit Assist, avec une réserve importante: la disponibilité dépend du plan, du pays et, pour certaines aides, de l’anglais uniquement. Une équipe à Vientiane ne doit pas supposer que l’assistant rédige correctement en lao ou en thaï, ni qu’il est inclus dans chaque compte gratuit.</p>
        <p>Le répertoire le classe en freemium. Mailchimp affiche un plan Free avec des plafonds de contacts et d’envois, plus des plans payants. Les chiffres exacts, les dépassements et les options SMS changent. Le SMS n’est pas universel: l’éditeur le décrit comme un add-on dans certains pays, avec des conditions d’envoi. Vérifiez la grille et les pays couverts sur mailchimp.com plutôt que de promettre un SMS thaïlandais dans un devis.</p>
        <p>Pour le marketing SEA, l’e-mail n’est qu’un canal parmi d’autres. Beaucoup de clients vivent dans LINE, Facebook Messenger ou WhatsApp. Mailchimp ne remplace pas ces fils. Il sert les personnes qui ont donné une adresse et un consentement: voyageurs internationaux, clients B2B, listes de newsletters d’hôtel, programmes de fidélité d’un resto qui collecte déjà des e-mails à l’addition. Si votre seule base est un LINE Official Account, commencez par clarifier le rôle de chaque canal avant d’acheter des contacts.</p>
        <p>Les assistants de sujet et de corps de message restent des brouillons. Un objet généré peut être trop agressif, trop américain, ou factuellement faux (réduction qui n’existe pas, visa inventé, plat du jour erroné). Validez chaque envoi comme s’il avait été écrit par un stagiaire pressé: utile, pas souverain.</p>
      </div>
    </section>
    <section>
      <h2>Ce qu’Intuit Mailchimp documente</h2>
      <div class="card">
        <ul>
          <li>Campagnes e-mail, audiences, tags et segmentation selon le plan</li>
          <li>Automations / parcours pour envoyer des messages selon un comportement ou une date</li>
          <li>Landings reliées à l’audience, avec templates et rapports</li>
          <li>Aides génératives et Intuit Assist, dont la couverture (langue, pays, plan) est bornée par l’éditeur — à vérifier dans le compte</li>
          <li>Intégrations (commerce, formulaires, pubs, outils de design) listées sur le site; chacune s’active à part</li>
        </ul>
        <p>Les noms de plans, les plafonds Free et la présence du SMS varient. Relisez pricing et conditions d’offre le jour de l’inscription. Aucun tarif n’est recopié ici.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Bon usage pour une PME</h2>
        <div class="card">
          <ul>
            <li>Newsletter et relances pour une base e-mail déjà consentie (hôtel, école, B2B)</li>
            <li>Landing d’offre + e-mail de confirmation, plutôt qu’un site entier</li>
            <li>Scénarios simples (bienvenue, après séjour, rappel d’événement) avec un humain qui relit</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Limites honnêtes</h2>
        <div class="card">
          <ul>
            <li>LINE, Messenger et WhatsApp restent les canaux quotidiens de beaucoup de clients SEA: l’e-mail ne les remplace pas</li>
            <li>Consentement, PDPA thaïlandaise et règles locales: à construire hors de l’outil, puis à refléter dans les formulaires</li>
            <li>Objets et corps générés par l’IA: à valider; prévisualisez aussi le rendu mobile avant l’envoi</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Listes e-mail, LINE et consentement en SEA</h2>
      <div class="card">
        <p>À Bangkok, un spa ou un hôtel peut avoir trois bases qui ne se parlent pas: followers Facebook, amis LINE, et une feuille Excel d’e-mails collectés à la réception. Coller l’Excel dans Mailchimp sans provenance est le moyen le plus rapide de brûler le domaine. Demandez à chaque ligne: qui a donné cette adresse, pour quel type de message, et comment la personne se désinscrit. La PDPA thaïlandaise, les règles lao ou vietnamiennes sur les données, et les exigences anti-spam des webmails ne sont pas un détail européen importé. Elles conditionnent votre droit d’envoyer. Mailchimp fournit des formulaires et des pages de désinscription; il ne rédige pas votre registre de traitements.</p>
        <p>LINE reste souvent le canal de service: confirmation de table, photo du plat, lien de paiement. L’e-mail sert mieux le contenu long, le récapitulatif de séjour, la facture, ou une offre mensuelle que l’on peut relire sur un ordinateur. Ne forcez pas un client LINE-only à «&nbsp;rejoindre la newsletter&nbsp;» pour obtenir une info opérationnelle. Offrez l’e-mail comme un plus (recettes, dates de festival, offres pour voyageurs qui ont quitté le pays et n’ouvrent plus LINE). Un double opt-in clair, dans la langue du client, vaut mieux qu’une case pré-cochée sur un Wi-Fi de lobby.</p>
        <p>Prévisualisez chaque campagne sur un vrai téléphone. Les clients SEA lisent surtout sur mobile, parfois en 3G dans un van ou un café. Un header trop haut, un bouton trop petit, une image lourde ou un texte blanc sur jaune rendent l’e-mail illisible. Utilisez les prévisualisations Mailchimp, puis envoyez un test vers Gmail, Outlook et un webmail local. Vérifiez aussi le mode sombre, qui inverse des logos. Le français avec accents, le thaï et le lao doivent s’afficher avec une police sûre; évitez les images-seul pour le message légal (prix, allergènes, conditions).</p>
        <p>L’IA de sujet et de corps est un accélérateur de brouillon. Demandez-lui trois objets, puis réécrivez. Un objet du type «&nbsp;Vous n’allez pas croire cette offre&nbsp;» peut passer un filtre de curiosité aux États-Unis et paraître douteux à un client d’entreprise à Hô Chi Minh-Ville. En français, méfiez-vous du tutoiement automatique et des anglicismes. En thaï, faites relire par un locuteur: un registre trop royal ou trop familier casse la marque. Si Intuit Assist n’est pas disponible dans votre pays ou seulement en anglais, ne contournez pas en collant un texte anglais dans une campagne thaïe. Rédigez dans la langue d’envoi.</p>
        <p>Les landings Mailchimp conviennent à une inscription, un téléchargement, un concours ou une page d’offre courte. Elles ne remplacent pas un site avec CMS, blog et SEO profond — Framer, WordPress ou un site agence restent plus adaptés à cette couche. Reliez la landing à une audience taguée, puis à une automation courte. Mesurez l’inscription, pas le «&nbsp;trafic&nbsp;» fantôme. Si vous achetez des ads vers cette page, alignez la promesse de l’annonce et le premier écran; un écart est une source de plaintes et de désinscriptions.</p>
        <p>Côté stack, Mailchimp s’intègre à de nombreuses boutiques et formulaires. Activez seulement ce que vous savez expliquer. Une sync Shopify ou WooCommerce mal réglée peut renvoyer des e-mails de panier à des numéros de test ou à des commandes déjà payées en cash à la réception. Pour un resto sans e-commerce, un formulaire d’inscription et une campagne mensuelle suffisent souvent. La complexité se paie en erreurs, pas en prestige d’outil.</p>
        <p>Avant le premier envoi depuis un nouveau domaine, configurez les authentifications que Mailchimp documente (SPF, DKIM, et ce que le compte demande encore). Un domaine d’hôtel qui n’a jamais envoyé d’e-mail et qui part sur 8 000 contacts achetés atterrira en spam. Partez d’une petite liste chaude, un volume bas, un contenu attendu. Documentez qui a le droit de cliquer sur Envoyer. L’IA n’a pas ce droit toute seule.</p>
        <p>Si votre équipe n’a aucune liste consentie, n’ouvrez pas Mailchimp pour «&nbsp;faire de l’IA&nbsp;». Construisez d’abord le formulaire, l’affichage des finalités, et le lien avec LINE. Revenez à Mailchimp quand vous avez des adresses que vous pourriez défendre devant un client mécontent — et devant un régulateur.</p>
      </div>
    </section>
    <section>
      <h2>Tarifs</h2>
      <div class="card">
        <p>Le répertoire indique un modèle freemium. Mailchimp affiche un plan Free et des plans payants dont les plafonds, envois et add-ons (dont le SMS selon les pays) changent. Nous n’inscrivons aucun prix. Vérifiez l’offre actuelle sur <a href="https://mailchimp.com" target="_blank" rel="noopener noreferrer">mailchimp.com</a> avant de budgéter contacts et automations.</p>
      </div>
    </section>
    <section>
      <h2>Obtenir Mailchimp</h2>
      ${visitFr('https://mailchimp.com')}
    </section>`,
  },
  {
    rel: 'fr/resources/ai-tools/longshot-ai/index.html',
    meta: 'Revue honnête de LongShot AI: le site officiel indique que le produit a été arrêté mi-2025. Ce qu’il était, pourquoi l’URL reste visible dans GSC, et quoi faire plutôt que de budgéter un outil discontinué.',
    lead: 'LongShot AI était un rédacteur SEO long format qui mettait en avant du contenu fact-checké et des sources personnalisées. Le site du vendeur indique désormais que le service a été discontinué mi-2025: ne le budgétez plus comme un outil vivant.',
    sections: `
    <section>
      <h2>Qu’était LongShot AI&nbsp;?</h2>
      <div class="card">
        <p><a href="https://www.longshot.ai" target="_blank" rel="noopener noreferrer">LongShot AI</a> se présentait comme un assistant d’écriture long format orienté SEO. Le positionnement public du produit, encore lisible sur la page d’accueil restante, parlait de contenu «&nbsp;fact-checked&nbsp;» destiné à se classer, avec la possibilité d’appuyer la rédaction sur des sources personnalisées. Pour une PME ou une agence, c’était un outil de brouillons d’articles, pas un CMS, pas un hébergeur, pas une garantie de position Google.</p>
        <p>Cette fiche ne vend pas LongShot comme s’il acceptait encore des abonnements. Au moment où nous écrivons, la page officielle annonce clairement que LongShot AI a été discontinué au milieu de 2025, après avoir servi des utilisateurs pendant plus de quatre ans. Le vendeur propose un contact vers le fondateur. Nous n’inventons pas de nouveaux plans, de prix, ni de date de relance. Si un revendeur vous propose une «&nbsp;licence LongShot&nbsp;», traitez-le comme un signal d’alerte, pas comme un canal officiel.</p>
        <p>La page vendeur mentionne aussi un chiffre d’utilisateurs. Nous ne le vérifions pas de façon indépendante et nous ne le reproduisons pas ici comme un fait d’audience. Ce que l’on peut dire sans broder: l’éditeur affirme avoir servi des utilisateurs pendant plusieurs années, puis avoir arrêté le produit. Pour une décision d’achat, le statut «&nbsp;discontinué&nbsp;» compte plus que n’importe quelle statistique passée.</p>
        <p>Pourquoi cette URL existe encore dans le répertoire WordsThatSells et dans Google Search Console: des pages d’annuaire, des backlinks et des requêtes de marque survivent à l’arrêt d’un SaaS. Les équipes cherchent encore «&nbsp;LongShot AI&nbsp;» parce qu’elles ont un login dans un gestionnaire de mots de passe, un article de blog de 2023, ou un devis d’agence non mis à jour. La revue honnête sert à fermer cette boucle, pas à relancer la demande.</p>
        <p>Pour une PME à Vientiane, Bangkok ou Hô Chi Minh-Ville, la bonne lecture est opérationnelle: retirez LongShot de la stack budgétée, archivez ce qui reste, et choisissez un autre flux d’écriture après un essai réel — pas après un encart publicitaire d’un clone.</p>
      </div>
    </section>
    <section>
      <h2>Ce que le site dit aujourd’hui — et ce que le produit promettait</h2>
      <div class="card">
        <ul>
          <li>Statut actuel annoncé par le vendeur: produit discontinué mi-2025, après plusieurs années de service</li>
          <li>Contact fondateur proposé sur la page d’accueil, à utiliser pour une question de compte ou d’historique, pas pour «&nbsp;acheter un plan&nbsp;»</li>
          <li>Ce que le produit était: rédacteur long format avec un marketing de contenu fact-checké</li>
          <li>Ce qu’il mettait en avant: sources personnalisées pour ancrer un article, plutôt qu’un simple chat générique</li>
          <li>Ce qu’il n’était déjà pas: une preuve que Google classera la page, ni un remplacement d’un rédacteur qui connaît le marché lao ou thaï</li>
        </ul>
        <p>Ne transformez pas cette liste en cahier des charges d’un successeur. Chaque outil vivant a sa propre doc. Partez d’un besoin (brief, sources, langues, CMS), pas d’une nostalgie de fonctionnalités.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Utile à savoir encore</h2>
        <div class="card">
          <ul>
            <li>Comprendre pourquoi GSC et d’anciens articles citent encore la marque</li>
            <li>Retrouver et archiver brouillons, logins et factures avant qu’un portail ne s’éteigne</li>
            <li>Expliquer à un client que «&nbsp;fact-checked&nbsp;» était un argument vendeur, pas une audit juridique</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Limites actuelles</h2>
        <div class="card">
          <ul>
            <li>Ne plus budgéter LongShot comme un poste SaaS vivant</li>
            <li>Ne pas acheter de licences revendeur, «&nbsp;lifetime&nbsp;» ou clés douteuses</li>
            <li>Ne pas republier d’anciens brouillons IA sans une relecture factuelle neuve</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Migration, brouillons restants et Search Console</h2>
      <div class="card">
        <p>Commencez par le budget. Si LongShot apparaît dans un abonnement carte, un devis annuel ou une slide «&nbsp;stack IA 2025&nbsp;», barrez la ligne. Un outil discontinué n’a plus de feuille de route, plus de correctifs, plus de garantie que l’export fonctionnera le mois prochain. Gardez éventuellement un mois de calendrier pour l’export, pas une ligne récurrente. Si un prestataire continue de facturer «&nbsp;LongShot inclus&nbsp;», demandez la preuve d’un accès officiel. En l’absence de preuve, c’est une prestation fantôme.</p>
        <p>Ensuite, les accès. Cherchez le domaine longshot.ai dans le gestionnaire de mots de passe, les e-mails de facturation, les comptes Google utilisés par l’équipe, et les cartes d’entreprise. Exportez ce que l’interface permet encore: articles, briefs, listes de sources, réglages de marque. Faites une archive ZIP datée sur un drive interne, avec le nom du client et la mention «&nbsp;brouillon IA, non publié tel quel&nbsp;». Puis révoquez les sessions, changez les mots de passe réutilisés ailleurs, et notez dans le registre des outils que le service est mort. Un login oublié dans une boîte partagée est une porte ouverte sur d’anciens textes clients.</p>
        <p>Le risque qualité des brouillons restants est plus grave qu’un login. Un article «&nbsp;fact-checké&nbsp;» généré en 2024 sur les visas lao, les taxes thaïlandaises ou les horaires d’un ferry peut être déjà faux. Le marketing du produit parlait de sources; cela n’a jamais dispensé d’une vérification humaine le jour de la publication. Avant de recycler un dossier LongShot dans WordPress, relisez chaque chiffre, chaque nom de lieu, chaque lien. Si la source n’est plus en ligne, retranchez l’affirmation. Republier un brouillon IA périmé pour «&nbsp;ne pas perdre le travail&nbsp;» coûte plus cher en corrections publiques qu’en temps d’écriture neuve.</p>
        <p>Les langues SEA aggravent le problème. Un long format anglais passable, passé dans un traducteur puis oublié dans un dossier «&nbsp;TH draft&nbsp;», produit souvent des tons cassés, des toponymes inventés, un tutoiement hors marque. Ne considérez pas ces fichiers comme une avance de contenu. Considérez-les comme des notes de brief. Un rédacteur local repart du sujet et des sources encore valides, pas du paragraphe machine.</p>
        <p>Pourquoi Google Search Console montre encore l’URL de cette fiche, ou d’anciennes pages qui citent LongShot: la marque a vécu assez longtemps pour laisser des empreintes. Des comparatifs, des affiliés et des annuaires — y compris le nôtre — ont indexé le nom. Les impressions GSC ne veulent pas dire que l’outil est achetable. Elles veulent dire que des gens tapent encore la requête, ou que Google recroise d’anciens liens. Si vous êtes éditeur d’un site qui recommandait LongShot, mettez à jour la page: statut discontinué, lien vers le site vendeur, et un paragraphe «&nbsp;que faire maintenant&nbsp;». Une page qui continue de vanter des plans payants alors que le vendeur a arrêté le service est une page trompeuse, même si elle ranke.</p>
        <p>Choisir une stack de remplacement n’est pas une course au clone. Écrivez d’abord le flux: qui brief, quelles sources (site client, lois, tarif réel), qui écrit, qui relit en thaï / lao / vietnamien / français, où ça se publie, qui mesure. Puis testez un ou deux outils vivants sur un vrai article, avec un essai que vous pouvez couper. Refusez les licences lifetime vendues sur des marketplaces, les «&nbsp;accounts LongShot&nbsp;» d’occasion, et les extensions navigateur qui promettent le même moteur. Si quelqu’un invoque le chiffre d’utilisateurs de l’ancienne page pour vendre un successeur, demandez un contrat et une doc à jour — pas une capture d’écran de 2023.</p>
        <p>Pour une agence, prévenez les clients par un court message: l’outil X n’existe plus selon le site officiel; vos articles déjà publiés restent en ligne s’ils ont été relus; les brouillons non publiés seront repris dans le nouvel outil après validation. Ne promettez pas une migration «&nbsp;à l’identique&nbsp;». Les prompts, les crédits et les intégrations meurent avec le produit. Facturez le temps d’audit des URL déjà en production: meta, faits, liens internes. C’est le travail utile, pas le deuil d’un SaaS.</p>
        <p>Nous laissons le bouton vers le site officiel pour que vous puissiez lire l’annonce de première main et, si besoin, écrire au fondateur. Ce n’est pas un appel à vous inscrire. C’est un appel à vérifier le statut plutôt qu’à croire une fiche d’annuaire non mise à jour — y compris les nôtres, si le vendeur change encore le message. Tant que longshot.ai affiche un arrêt mi-2025, traitez LongShot comme une référence historique, pas comme une ligne de votre stack SEA.</p>
      </div>
    </section>
    <section>
      <h2>Tarifs</h2>
      <div class="card">
        <p>Le répertoire historique indiquait un modèle payant. Le site officiel dit désormais que le produit est discontinué: n’achetez pas de plan, n’entrez pas de carte, n’acceptez pas de licence tierce. Pour le statut et un contact fondateur, ouvrez <a href="https://www.longshot.ai" target="_blank" rel="noopener noreferrer">longshot.ai</a>. Aucun tarif actuel n’est listé ici, parce qu’il n’y a pas d’offre vivante à recopier.</p>
      </div>
    </section>
    <section>
      <h2>Voir l’annonce officielle</h2>
      ${visitFr('https://www.longshot.ai')}
    </section>`,
  },
];
