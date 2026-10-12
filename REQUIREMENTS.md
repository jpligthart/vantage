# Requirements & Ontwerp — Document & Portfolio Review Assistant

**Versie:** 0.1  
**Status:** Concept voor implementatie in Cursor  
**Platform:** macOS (Apple Silicon), Docker / OrbStack, lokale Ollama  
**Werknaam:** Review Assistant

## 1. Doel en uitgangspunten

Review Assistant is een lokale AI-applicatie die docenten ondersteunt bij het analyseren van studentenwerk.

De applicatie helpt bij het begrijpen van documenten, vinden van relevante informatie, onderzoeken van onderbouwingen en kritisch bespreken van observaties.

**De AI is een kritische sparringpartner, geen automatische beoordelaar.**

De applicatie moet:

- Direct bruikbaar zijn voor één document, zonder eerst een project of portfolio aan te maken.
- Meerdere documenten en andere bronnen kunnen combineren.
- Complexe portfolio's kunnen onderzoeken.
- Controleerbare bronverwijzingen geven.
- Actief zoeken naar informatie die de interpretatie van de gebruiker tegenspreekt.
- Onderscheid maken tussen feiten, interpretaties en onzekerheden.
- Volledig lokaal kunnen functioneren, behalve wanneer de gebruiker bewust externe bronnen importeert.

### 1.1 Ontwerpprincipes

**Document-first:** de eenvoudigste workflow is een document openen en daarover praten.

**Evidence-first:** uitspraken over studentenwerk worden waar mogelijk ondersteund met concrete verwijzingen.

**Human-in-control:** de docent blijft verantwoordelijk voor interpretatie en beoordeling.

**Critical-by-default:** de AI mag niet automatisch meegaan in de aannames van de gebruiker.

**Local-first:** verwerking, opslag, embeddings en LLM-inference vinden lokaal plaats.

**Progressive complexity:** eenvoudige documenten worden eenvoudig verwerkt. Complexere retrieval en agentfunctionaliteit worden alleen gebruikt wanneer nodig.

---

## 2. Functionele requirements

Prioriteiten: P0 = noodzakelijk voor MVP, P1 = eerste uitbreiding, P2 = later.

| ID | Requirement | Prioriteit |
|---|---|---|
| FR-01 | Gebruiker kan een PDF openen en direct analyseren | P0 |
| FR-02 | Gebruiker kan een DOCX openen en analyseren | P0 |
| FR-03 | Gebruiker kan vragen stellen over een geopend document | P0 |
| FR-04 | AI kan volledige documentstructuur identificeren | P0 |
| FR-05 | AI verwijst naar specifieke passages en paginanummers waar beschikbaar | P0 |
| FR-06 | Gebruiker kan bronverwijzingen aanklikken | P0 |
| FR-07 | Gebruiker kan tekst selecteren en daarover vragen stellen | P0 |
| FR-08 | AI kan observaties kritisch onderzoeken | P0 |
| FR-09 | AI onderscheidt feiten, interpretaties en onzekerheden | P0 |
| FR-10 | Analysesessies worden lokaal opgeslagen | P0 |
| FR-11 | Bestaande analysesessies kunnen worden hervat | P0 |
| FR-12 | Gebruiker kan meerdere documenten aan een sessie toevoegen | P1 |
| FR-13 | AI kan verbanden tussen documenten onderzoeken | P1 |
| FR-14 | Applicatie ondersteunt hybride retrieval | P1 |
| FR-15 | Gebruiker kan websites importeren | P1 |
| FR-16 | Gebruiker kan GitHub-repositories importeren | P1 |
| FR-17 | Gebruiker kan volledige directories importeren | P1 |
| FR-18 | Gebruiker kan eigen observaties vastleggen | P1 |
| FR-19 | Applicatie ondersteunt onderwijsrichtlijnen als aparte kennisbron | P1 |
| FR-20 | Applicatie kan zelfstandig de structuur van een portfolio verkennen | P2 |
| FR-21 | AI kan aandachtspunten en mogelijke tegenstrijdigheden signaleren | P2 |
| FR-22 | Gebruiker kan analyses exporteren | P2 |

### 2.1 Documentanalyse

Na het openen van een document:

1. Wordt het bestand lokaal opgeslagen.
2. Worden tekst en documentstructuur geëxtraheerd.
3. Worden secties, koppen en paginaverwijzingen geregistreerd.
4. Wordt het document beschikbaar gemaakt voor de AI.
5. Kan de gebruiker direct vragen stellen.

Voor kleine documenten wordt bij voorkeur de volledige documentinhoud als context gebruikt.

Bij grotere documenten wordt retrieval toegepast.

De gebruiker moet kunnen zien of het antwoord is gebaseerd op de volledige documentinhoud of op geselecteerde passages.

### 2.2 Kritisch sparren

De AI moet expliciet worden geïnstrueerd om:

- Niet automatisch akkoord te gaan met de gebruiker.
- Claims te controleren aan de hand van beschikbare bronnen.
- Actief tegenbewijs te zoeken wanneer de gebruiker een conclusie formuleert.
- Alternatieve interpretaties te onderzoeken.
- Onvoldoende onderbouwde conclusies te benoemen.
- Ontbrekend bewijs niet gelijk te stellen aan ontbrekende competentie.
- Gerichte vervolgvragen voor een assessment te kunnen voorstellen.

De AI mag geen definitieve beoordelingen of competentiescores vaststellen.

### 2.3 Bronverwijzingen

Bronverwijzingen zijn een kernfunctionaliteit, geen optionele toevoeging.

Elke verwijzing bevat waar mogelijk:

- Documentnaam.
- Pagina.
- Sectie.
- Relevante tekstpassage.
- Interne bronidentificatie.

De applicatie moet bronverwijzingen koppelen aan de oorspronkelijke documenten.

**Een door het taalmodel gegenereerd paginanummer mag nooit zonder verificatie als bronverwijzing worden weergegeven.**

---

## 3. Gebruikersinterface

De interface bestaat uit drie hoofdpanelen.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Review Assistant                              [Model] [Settings]   │
├─────────────────┬──────────────────────────┬───────────────────────┤
│ BRONNEN         │ DOCUMENT VIEWER          │ AI ASSISTANT          │
│                 │                          │                       │
│ Projectplan.pdf │ Documentinhoud           │ Gespreksgeschiedenis  │
│                 │                          │                       │
│ + Bron          │ Selecteerbare tekst      │ Bronverwijzingen      │
│                 │                          │                       │
│                 │                          │                       │
│                 │                          │                       │
│                 │                          ├───────────────────────┤
│                 │                          │ Stel een vraag...     │
├─────────────────┴──────────────────────────┴───────────────────────┤
│ [Sessies] [Observaties] [Verkennen] [Onderzoeken] [Sparren]         │
└────────────────────────────────────────────────────────────────────┘
```

### 3.1 Belangrijke interacties

Een gebruiker kan direct een bestand naar de applicatie slepen.

Na import opent het document in de viewer en wordt een analysesessie aangemaakt.

De gebruiker kan tekst selecteren en via een contextmenu kiezen voor bijvoorbeeld 'Bespreek selectie'.

De geselecteerde passage wordt met documentcontext aan de AI aangeboden.

Bij een antwoord met bronverwijzingen kan de gebruiker op een verwijzing klikken. De documentviewer navigeert naar de juiste pagina en markeert waar technisch mogelijk de relevante passage.

### 3.2 Analysemethoden

De interface biedt drie modi:

| Modus | Gedrag |
|---|---|
| Verkennen | Beschrijven, structureren en uitleggen |
| Onderzoeken | Gericht zoeken en bewijs analyseren |
| Sparren | Kritisch reflecteren en tegenbewijs zoeken |

Dit zijn configuraties van dezelfde AI-agent, geen afzonderlijke agents.

De gebruiker kan tijdens een gesprek van modus wisselen.

---

## 4. Technische architectuur

### 4.1 Technology stack

| Component | Technologie |
|---|---|
| Frontend | React + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui |
| Backend | Python + FastAPI |
| AI-integratie | PydanticAI |
| LLM | Ollama |
| Document parsing | Docling |
| PDF-weergave | PDF.js |
| Database | SQLite |
| Full-text search | SQLite FTS5 |
| Vector search | Lokale vectorindex |
| Website-import | HTTP-parser, Playwright als fallback |
| Repository-import | Git |
| Containerisatie | Docker Compose |

De applicatie wordt als een modulaire monoliet ontwikkeld.

Voor de MVP is geen afzonderlijke databasecontainer nodig.

### 4.2 Deployment

```text
macOS
│
├── Ollama
│   └── Local LLM
│
└── OrbStack
    │
    └── Docker Compose
        │
        ├── Frontend / Webserver
        │
        ├── FastAPI Backend
        │   ├── AI Agent
        │   ├── Document Processor
        │   ├── Retrieval
        │   └── Session Management
        │
        └── Persistent Storage
            ├── SQLite
            ├── Source Documents
            └── Search Index
```

De backend gebruikt de Ollama API via:

`http://host.docker.internal:11434`

Ollama blijft native op macOS draaien om de beschikbare Apple Silicon-acceleratie te benutten.

De applicatie wordt uitsluitend op localhost gepubliceerd.

## 5. Datamodel

Het datamodel maakt onderscheid tussen bronnen, analysesessies en gesprekken.

Een bron kan in meerdere analysesessies worden gebruikt. Een analysesessie kan meerdere bronnen bevatten.

### 5.1 Entiteiten

| Entiteit | Belangrijkste eigenschappen |
|---|---|
| `Source` | ID, naam, type, locatie, checksum, importdatum, status |
| `Document` | ID, source_id, titel, metadata, aantal pagina's |
| `DocumentSection` | ID, document_id, parent_id, titel, inhoud, locatie |
| `SourceChunk` | ID, section_id, inhoud, embedding, bronlocatie |
| `AnalysisSession` | ID, titel, aanmaakdatum, laatste wijziging |
| `SessionSource` | session_id, source_id |
| `ConversationMessage` | ID, session_id, rol, inhoud, timestamp |
| `Citation` | ID, message_id, source_id, locatie, tekstpassage |
| `Observation` | ID, session_id, inhoud, gekoppelde bronnen |
| `ReferenceMaterial` | ID, source_id, categorie, versie |

Een bron kan een lokaal bestand, website of repository zijn.

De originele bron blijft beschikbaar naast de geëxtraheerde inhoud.

### 5.2 Bronnen en analysesessies

Een analysesessie is geen portfolio.

Een sessie is een werkruimte waarin de gebruiker één of meerdere bronnen bespreekt.

Voorbeelden:

- Analyse van één projectplan.
- Vergelijking van een onderzoeksverslag en architectuurdocument.
- Bespreking van een compleet studentenportfolio.

Een portfolio kan later als afzonderlijke organisatorische entiteit worden toegevoegd, maar is niet noodzakelijk voor de MVP.

---

## 6. AI-architectuur

### 6.1 Agent

De applicatie gebruikt één AI-agent met configureerbare gedragsinstructies.

De agent beschikt over tools waarmee hij documenten kan onderzoeken.

| Tool | Beschrijving |
|---|---|
| `list_sources` | Beschikbare bronnen binnen de sessie |
| `get_document_structure` | Hoofdstukken en secties opvragen |
| `search_sources` | Hybride zoeken |
| `read_section` | Volledige sectie lezen |
| `read_document` | Volledig document opvragen |
| `get_source_context` | Omringende tekst van een passage lezen |
| `find_counterevidence` | Gericht naar mogelijk tegenbewijs zoeken |

Toolaanroepen worden door de backend uitgevoerd.

De agent krijgt uitsluitend toegang tot bronnen die expliciet aan de analysesessie zijn gekoppeld.

### 6.2 Contextstrategie

De applicatie ondersteunt twee strategieën.

**Full-context**

Bij kleine documenten wordt de volledige inhoud in de context opgenomen.

Hierbij moet rekening worden gehouden met:

- Het contextvenster van het gekozen model.
- De omvang van de gespreksgeschiedenis.
- Ruimte voor de systeemprompt.
- Ruimte voor het antwoord.

**Retrieval**

Bij grotere documenten of meerdere bronnen wordt relevante inhoud opgehaald.

De retrievalstrategie combineert:

- Full-text search.
- Semantisch zoeken.
- Navigatie op basis van documentstructuur.
- Gericht lezen van aanvullende secties.

De contextstrategie wordt automatisch gekozen op basis van de beschikbare tokenruimte. De gebruiker kan deze keuze overrulen.

### 6.3 Betrouwbaarheid

De agent moet expliciet aangeven wanneer:

- Informatie niet gevonden is.
- Een bron niet volledig onderzocht is.
- Een document niet correct verwerkt kon worden.
- Een conclusie onvoldoende onderbouwd is.
- Bronnen elkaar tegenspreken.

Antwoorden bevatten geen verzonnen verwijzingen.

Bronverwijzingen worden door de backend gevalideerd tegen daadwerkelijk beschikbare bronlocaties.

### 6.4 Systeemprompt

De volgende instructies vormen de basis voor het gedrag van de agent.

> Je bent een kritische onderzoeks- en sparringpartner voor een docent in het hoger beroepsonderwijs.
>
> Je ondersteunt bij het begrijpen en analyseren van studentenwerk.
>
> Je bent geen beoordelaar en bepaalt geen competentiescores.
>
> Onderbouw inhoudelijke uitspraken met controleerbare bronnen.
>
> Maak onderscheid tussen observaties, interpretaties en onzekerheden.
>
> Neem uitspraken van de gebruiker niet automatisch als juist aan.
>
> Onderzoek actief alternatieve interpretaties en mogelijk tegenbewijs.
>
> Ontbrekend bewijs betekent niet automatisch dat een student een competentie niet beheerst.
>
> Stel gerichte vervolgvragen wanneer informatie ontbreekt.
>
> Geef duidelijk aan wanneer je onvoldoende informatie hebt.
>
> Houd antwoorden concreet, kritisch en beknopt.
>
> Gebruik onderwijsrichtlijnen als referentiekader, maar behandel niet iedere richtlijn automatisch als een harde beoordelingsnorm.

De uiteindelijke prompt wordt per analysemodus aangevuld met specifieke instructies.

---

## 7. Backend API

De backend biedt een REST API voor bronbeheer, sessies en documentnavigatie.

Voor chatantwoorden wordt streaming toegepast.

### 7.1 Belangrijkste endpoints

| Methode | Endpoint | Functie |
|---|---|---|
| POST | `/api/sources/upload` | Bestand importeren |
| GET | `/api/sources/{id}` | Broninformatie ophalen |
| GET | `/api/sources/{id}/content` | Origineel bestand ophalen |
| GET | `/api/sources/{id}/structure` | Documentstructuur ophalen |
| DELETE | `/api/sources/{id}` | Bron verwijderen |
| POST | `/api/sessions` | Analysesessie aanmaken |
| GET | `/api/sessions` | Sessies ophalen |
| GET | `/api/sessions/{id}` | Sessie openen |
| POST | `/api/sessions/{id}/sources` | Bron koppelen |
| DELETE | `/api/sessions/{id}` | Sessie verwijderen |
| POST | `/api/sessions/{id}/chat` | Bericht versturen |
| GET | `/api/sessions/{id}/messages` | Gespreksgeschiedenis ophalen |
| GET | `/api/models` | Beschikbare Ollama-modellen ophalen |

De chatinterface ondersteunt streaming via Server-Sent Events.

De backend retourneert gestructureerde antwoorden met afzonderlijke bronverwijzingen.

---

## 8. Niet-functionele requirements

### NFR-01 — Privacy

Alle documentverwerking, embeddings en AI-inference vinden lokaal plaats.

De applicatie gebruikt geen externe AI-diensten.

Externe bronnen worden alleen opgehaald na expliciete actie van de gebruiker.

### NFR-02 — Beveiliging

De applicatie:

- Is uitsluitend bereikbaar via localhost.
- Heeft geen publieke netwerkpoorten nodig.
- Draait met minimale containerrechten.
- Gebruikt geen privileged containers.
- Heeft geen toegang tot de Docker-socket.
- Valideert uploads en bestandstypen.
- Beschermt tegen path traversal.
- Beperkt bestandsgrootte en verwerkingsduur.
- Behandelt geïmporteerde inhoud als onbetrouwbare data.

Voor het ophalen van websites worden interne netwerkadressen, loopbackadressen en cloudmetadata-endpoints geblokkeerd. Redirects worden opnieuw gecontroleerd.

### NFR-03 — Prestaties

Documentverwerking mag de gebruikersinterface niet blokkeren.

De applicatie toont de verwerkingsstatus.

LLM-antwoorden worden gestreamd.

Het systeem moet bruikbaar blijven wanneer documenten op de achtergrond worden geïndexeerd.

### NFR-04 — Betrouwbaarheid

Fouten tijdens documentverwerking mogen geen bestaande sessies beschadigen.

Documenten die niet verwerkt kunnen worden, krijgen een duidelijke foutstatus.

De applicatie bewaart de oorspronkelijke bestanden.

### NFR-05 — Onderhoudbaarheid

De applicatie gebruikt:

- Type hints en statische typecontrole.
- Duidelijk gescheiden modules.
- Dependency injection waar zinvol.
- Database-migraties.
- Geautomatiseerde tests.
- Gestructureerde logging.
- Centrale configuratie via environment variables.

Geen onnodige abstractielagen of microservices.

### NFR-06 — Dataretentie

De gebruiker kan een analysesessie verwijderen.

Bronnen die nog in andere sessies worden gebruikt, blijven behouden.

Een bron kan afzonderlijk volledig worden verwijderd, inclusief geëxtraheerde inhoud, embeddings en gekoppelde indexgegevens.

---

## 9. Ontwikkelfasen

### Fase 1 — Documentanalyse

**Doel:** een werkende applicatie waarmee één document bekeken en besproken kan worden.

Functionaliteiten:

- React-interface met documentviewer en chat.
- PDF- en DOCX-import.
- Documentverwerking met Docling.
- Lokale opslag.
- Ollama-integratie.
- Full-contextanalyse.
- Streaming chat.
- Analysesessies opslaan en hervatten.
- Kritische systeemprompt.
- Bronverwijzingen.

**Acceptatiecriteria**

1. Een gebruiker kan een PDF uploaden en bekijken.
2. Een gebruiker kan een DOCX importeren en de inhoud bekijken.
3. De gebruiker kan vragen stellen over het document.
4. De AI kan verwijzen naar daadwerkelijk aanwezige passages.
5. De gebruiker kan via een bronverwijzing naar de relevante documentlocatie navigeren.
6. De AI maakt onderscheid tussen observaties en interpretaties.
7. Een gesprek blijft beschikbaar na het opnieuw starten van de applicatie.
8. De applicatie werkt zonder externe AI-diensten.

### Fase 2 — Meerdere bronnen en retrieval

**Doel:** meerdere documenten gezamenlijk kunnen onderzoeken.

Functionaliteiten:

- Meerdere bronnen per sessie.
- Documentstructuur en sectienavigatie.
- Full-text search.
- Vector search.
- Hybride retrieval.
- Agenttools voor documentnavigatie.
- Tekstselectie en contextvragen.
- Observaties vastleggen.

**Acceptatiecriteria**

1. De gebruiker kan meerdere documenten toevoegen.
2. De AI kan verbanden tussen documenten onderzoeken.
3. De AI kan informatie terugvinden zonder het volledige document in context te laden.
4. De AI kan aanvullende secties opvragen.
5. De AI maakt duidelijk welke bronnen daadwerkelijk onderzocht zijn.
6. De gebruiker kan geselecteerde passages bespreken.

### Fase 3 — Websites en repositories

**Doel:** online portfolio's en andere externe bronnen ondersteunen.

Functionaliteiten:

- Website-import.
- Linkdetectie.
- Selectie van te importeren pagina's.
- GitHub-repository-import.
- Behoud van oorspronkelijke bronlocaties.
- Periodiek of handmatig opnieuw importeren.

**Acceptatiecriteria**

1. De gebruiker kan een website-URL toevoegen.
2. De applicatie toont welke bronnen gevonden zijn.
3. De gebruiker bepaalt welke bronnen worden geïmporteerd.
4. De AI kan geïmporteerde webpagina's analyseren.
5. De gebruiker kan een GitHub-repository toevoegen.
6. De applicatie bewaart verwijzingen naar oorspronkelijke bestanden en URL's.

### Fase 4 — Portfolioanalyse

**Doel:** grotere verzamelingen bronnen gestructureerd onderzoeken.

Functionaliteiten:

- Portfolio's als organisatorische eenheid.
- Automatische structuurverkenning.
- Analyse van onderlinge relaties.
- Detectie van mogelijke tegenstrijdigheden.
- Koppeling met onderwijsrichtlijnen.
- Proactieve aandachtspunten.
- Export van observaties.

---

## 10. Teststrategie

Naast reguliere unit- en integratietests moet de kwaliteit van de AI systematisch worden getest.

Hiervoor wordt een kleine evaluatieset gemaakt met documenten en vragen waarvan de verwachte antwoorden bekend zijn.

### Testcategorieën

| Categorie | Test |
|---|---|
| Vindbaarheid | Kan de AI specifieke informatie terugvinden? |
| Bronbetrouwbaarheid | Verwijst de AI naar de juiste passage? |
| Volledigheid | Herkent de AI wanneer onvoldoende bronnen zijn onderzocht? |
| Kritisch vermogen | Kan de AI een onjuiste aanname van de gebruiker weerleggen? |
| Onzekerheid | Geeft de AI aan wanneer informatie ontbreekt? |
| Contextbegrip | Kan de AI verbanden tussen passages herkennen? |
| Hallucinaties | Verwijst de AI uitsluitend naar bestaande bronnen? |

Een belangrijke regressietest:

De gebruiker beweert dat een document geen onderbouwing bevat, terwijl die onderbouwing wel aanwezig is.

De AI moet de relevante passage vinden en de aanname van de gebruiker corrigeren.

Een tweede test:

De gebruiker beweert dat een student een bepaalde competentie niet beheerst, terwijl alleen het bewijs ontbreekt.

De AI moet het onderscheid tussen ontbrekend bewijs en ontbrekende bekwaamheid expliciet maken.

---

## 11. Projectstructuur

Voorgestelde repository-indeling:

```text
review-assistant/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── documents/
│   │   │   ├── chat/
│   │   │   ├── sessions/
│   │   │   └── observations/
│   │   ├── services/
│   │   └── types/
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── agents/
│   │   ├── documents/
│   │   ├── retrieval/
│   │   ├── sessions/
│   │   ├── models/
│   │   └── core/
│   ├── migrations/
│   ├── tests/
│   └── pyproject.toml
│
├── docker/
│   ├── backend.Dockerfile
│   └── frontend.Dockerfile
│
├── docs/
│   ├── requirements.md
│   ├── architecture.md
│   └── decisions/
│
├── data/
│
├── compose.yaml
├── .env.example
├── .gitignore
└── README.md
```

De `data`-directory bevat uitsluitend lokale runtimegegevens en wordt uitgesloten van Git.

---

## 12. Implementatie-instructies voor Cursor

Onderstaande instructie kan samen met dit document als startprompt worden gebruikt.

> Bouw de applicatie Review Assistant volgens de requirements en architectuur in dit document.
>
> Werk incrementeel en implementeer uitsluitend fase 1.
>
> Begin met het opzetten van de projectstructuur, Docker Compose, FastAPI-backend en React-frontend.
>
> Implementeer vervolgens documentimport, documentweergave en de Ollama-integratie.
>
> Voeg daarna analysesessies, streaming chat en betrouwbare bronverwijzingen toe.
>
> Gebruik bestaande, onderhouden libraries waar mogelijk.
>
> Vermijd onnodige abstracties, microservices en overengineering.
>
> Gebruik typeveilige interfaces tussen frontend en backend.
>
> Voeg tests toe voor de belangrijkste functionaliteiten.
>
> Documenteer belangrijke architectuurkeuzes als Architecture Decision Records.
>
> Zorg dat de applicatie volledig lokaal kan draaien op macOS met OrbStack en een native Ollama-installatie.
>
> Controleer na iedere implementatiestap of de applicatie bouwt, de tests slagen en de bestaande functionaliteit blijft werken.
>
> Implementeer geen functionaliteiten uit latere fasen tenzij die noodzakelijk zijn voor een goede architectuur.
>
> Wanneer een requirement technisch onduidelijk is, presenteer eerst de mogelijke oplossingen met hun voor- en nadelen.

---

## 13. Openstaande ontwerpbeslissingen

Voordat Cursor begint, zou ik nog vier zaken expliciet laten onderzoeken.

**ADR-001 — Vectoropslag**

Onderzoek welke lokale vectoroplossing het beste aansluit op SQLite. Vermijd een aparte databasecontainer tenzij daarvoor een duidelijke technische reden bestaat.

**ADR-002 — Documentviewer**

Onderzoek hoe PDF.js gecombineerd kan worden met de locatiegegevens van Docling om betrouwbare bronverwijzingen te realiseren. Voor DOCX kan een HTML-preview worden gebruikt, mits duidelijk is dat de weergave kan afwijken van de oorspronkelijke paginering.

**ADR-003 — Agentframework**

Valideer of PydanticAI voldoende ondersteuning biedt voor Ollama, streaming, toolaanroepen en gestructureerde resultaten. Houd de koppeling met het agentframework vervangbaar.

**ADR-004 — Contextbeheer**

Ontwerp een strategie voor de keuze tussen full-context en retrieval, inclusief tokenbudget, documentomvang en modelcapaciteiten.

---

### Mijn belangrijkste technische kanttekening

Ik zou Cursor **niet meteen het hele ontwerp laten implementeren**. Begin met fase 1 en test eerst of documentverwerking, bronverwijzingen en kritisch redeneren voldoende betrouwbaar zijn.

Vooral de combinatie van Docling en PDF.js verdient aandacht. Tekst extraheren is relatief eenvoudig; een gevonden passage betrouwbaar terugvinden en markeren in het oorspronkelijke document is aanzienlijk lastiger.

En juist die functionaliteit is voor jouw toepassing essentieel.

Dit document is een goede eerste specificatie. De requirements zijn bewust gescheiden van de implementatiefasen, zodat Cursor niet meteen een compleet platform gaat bouwen terwijl je eigenlijk gewoon een projectplan wilt bespreken.