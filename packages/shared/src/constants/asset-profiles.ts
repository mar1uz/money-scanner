export interface AssetProfile {
  symbol: string;
  name: string;
  headlineRo: string;
  headlineEn: string;
  whatItDoesRo: string;
  whatItDoesEn: string;
  coreUtilityRo: string;
  coreUtilityEn: string;
  originRo: string;
  originEn: string;
  categoryLabelRo: string;
  categoryLabelEn: string;
  ecosystem: string;
  keyPointsRo: string[];
  keyPointsEn: string[];
}

export const ASSET_PROFILES_DATABASE: Record<string, AssetProfile> = {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. CRYPTO MAJORS & PROTOCOLS
  // ─────────────────────────────────────────────────────────────────────────
  BTC: {
    symbol: 'BTC',
    name: 'Bitcoin',
    headlineRo: 'Primul activ digital descentralizat și etalonul monetar al ecosistemului crypto (Aur Digital).',
    headlineEn: 'The first decentralized digital asset and monetary benchmark of crypto (Digital Gold).',
    whatItDoesRo: 'Bitcoin este o rețea monetară peer-to-peer securizată prin consens Proof-of-Work (PoW), concepută pentru a permite transferul de valoare fără intermediari centralizați sau cenzură.',
    whatItDoesEn: 'Bitcoin is a peer-to-peer monetary network secured by Proof-of-Work (PoW), designed to transfer value without central intermediaries or censorship.',
    coreUtilityRo: 'Depozit de valoare global (store of value), acoperire împotriva devalorizării monedelor fiduciare (aur digital) și activ de rezervă pentru trezorerii și ETF-uri spot.',
    coreUtilityEn: 'Global store of value, monetary hedge against fiat currency debasement (digital gold), and treasury reserve asset for institutions and spot ETFs.',
    originRo: 'Lansat pe 3 ianuarie 2009 de creatorul pseudonim Satoshi Nakamoto prin blocul Genesis.',
    originEn: 'Launched on January 3, 2009 by pseudonymous creator Satoshi Nakamoto with the Genesis block.',
    categoryLabelRo: 'Monedă Digitală & Store of Value',
    categoryLabelEn: 'Digital Currency & Store of Value',
    ecosystem: 'Bitcoin Network (PoW / SHA-256 / 21M hard cap)',
    keyPointsRo: [
      'Limită fixă absolută de 21 milioane de monede și înjumătățire a emisiunii (halving) la fiecare 4 ani.',
      'Securitate inegalabilă datorită celei mai mari puteri de calcul (hashrate) descentralizate din lume.',
      'Adoptat oficial ca activ de rezervă instituțională prin ETF-uri spot de la BlackRock, Fidelity și trezorerii corporative.'
    ],
    keyPointsEn: [
      'Strict 21 million maximum supply cap with automated programmatic halving every 4 years.',
      'Unrivaled network security backed by the world’s largest decentralized computing hashrate.',
      'Adopted as institutional reserve asset via BlackRock/Fidelity spot ETFs and corporate balance sheets.'
    ]
  },
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    headlineRo: 'Platforma de referință pentru contracte inteligente, finanțe descentralizate (DeFi) și rețele Layer 2.',
    headlineEn: 'The benchmark platform for smart contracts, decentralized finance (DeFi), and Layer 2 ecosystems.',
    whatItDoesRo: 'Ethereum este un computer mondial descentralizat pe care rulează contracte inteligente autonome, aplicații financiare (DeFi), tokenuri ERC-20, NFT-uri și rețele secundare de scalare.',
    whatItDoesEn: 'Ethereum is a decentralized global state machine executing smart contracts, DeFi protocols, ERC-20 tokens, and Layer 2 rollups.',
    coreUtilityRo: 'Combustibil de tranzacționare (gas fees) pentru decontarea pe blockchain, staking pentru securitatea rețelei PoS (randament 3-4%) și colateral de bază în DeFi.',
    coreUtilityEn: 'Gas token for settlement fees, PoS network staking collateral (3-4% yield), and core reserve asset across DeFi protocols.',
    originRo: 'Propus în 2013 de Vitalik Buterin și lansat oficial pe 30 iulie 2015 alături de Gavin Wood, Charles Hoskinson și alții.',
    originEn: 'Proposed in 2013 by Vitalik Buterin and launched on July 30, 2015 alongside Gavin Wood, Charles Hoskinson, and others.',
    categoryLabelRo: 'Layer 1 Smart Contracts',
    categoryLabelEn: 'Layer 1 Smart Contracts',
    ecosystem: 'Ethereum (PoS / EVM / EIP-1559 Burn Mechanism)',
    keyPointsRo: [
      'Cel mai mare volum de valoare blocată (TVL) și venituri reale generate din comisioane de tranzacționare.',
      'Mecanism de ardere a taxelor (EIP-1559) care reduce oferta de ETH în perioadele de activitate intensă.',
      'Centrul de securitate și decontare pentru principalele rollup-uri Layer 2 (Arbitrum, Optimism, Base).'
    ],
    keyPointsEn: [
      'Highest total value locked (TVL) and institutional developer mindshare in Web3.',
      'EIP-1559 fee-burn mechanism dynamically turning ETH deflationary during high network demand.',
      'Primary security and settlement anchor for leading Layer 2 rollups (Arbitrum, Optimism, Base).'
    ]
  },
  SOL: {
    symbol: 'SOL',
    name: 'Solana',
    headlineRo: 'Blockchain monolitic de înaltă performanță optimizat pentru tranzacții ultra-rapide și comisioane minime.',
    headlineEn: 'High-throughput monolithic blockchain optimized for sub-second finality and ultra-low transaction fees.',
    whatItDoesRo: 'Solana execută zeci de mii de tranzacții pe secundă la costuri fracționare de cent, utilizând arhitectura Proof of History (PoH) combinată cu Proof of Stake (PoS).',
    whatItDoesEn: 'Solana processes thousands of transactions per second at sub-penny fees using Proof of History (PoH) and Proof of Stake (PoS).',
    coreUtilityRo: 'Plata comisioanelor de rețea, staking validator și lichiditate primară pentru aplicații DeFi, DEX-uri de mare viteză, plăți și meme coins.',
    coreUtilityEn: 'Network gas token, validator staking, and base liquidity across high-frequency DEXes, consumer payments, and tokens.',
    originRo: 'Fondat în 2017 de Anatoly Yakovenko și Greg Fitzgerald (foști ingineri Qualcomm) și lansat pe mainnet în martie 2020.',
    originEn: 'Founded in 2017 by Anatoly Yakovenko and Greg Fitzgerald (former Qualcomm engineers) and launched in March 2020.',
    categoryLabelRo: 'Layer 1 High-Throughput',
    categoryLabelEn: 'Layer 1 High-Throughput',
    ecosystem: 'Solana (Proof of History + Sealevel Parallel Engine)',
    keyPointsRo: [
      'Execuție paralelă prin motorul Sealevel ce permite finalitate sub o secundă (~400ms).',
      'Ecosistem dominant în volumul de tranzacționare retail pe DEX-uri (Raydium, Orca, Jupiter).',
      'Adoptat de mari procesatori de plăți precum Visa și Shopify pentru decontări instant.'
    ],
    keyPointsEn: [
      'Parallel smart contract execution via Sealevel engine delivering sub-second (~400ms) finality.',
      'Leading decentralized exchange (DEX) retail trading volumes across Jupiter, Raydium, and Orca.',
      'Integrated by global fintech leaders including Visa and Shopify for instant merchant settlement.'
    ]
  },
  BNB: {
    symbol: 'BNB',
    name: 'BNB Chain',
    headlineRo: 'Tokenul nativ al ecosistemului BNB Chain și al platformei globale Binance.',
    headlineEn: 'Native utility and gas asset of BNB Chain and the Binance exchange ecosystem.',
    whatItDoesRo: 'BNB alimentează rețeaua BNB Smart Chain (BSC) și oferă reduceri de comisioane, participare la launchpool-uri și drepturi de guvernanță.',
    whatItDoesEn: 'BNB powers the EVM-compatible BNB Smart Chain (BSC), offering fee discounts, Launchpool allocations, and governance.',
    coreUtilityRo: 'Gas token pe BSC, reduceri pe bursa Binance, participare la vânzări de tokenuri noi și arderi trimestriale automate.',
    coreUtilityEn: 'BSC transaction fuel, Binance fee reductions, Launchpool staking access, and automated quarterly token burns.',
    originRo: 'Lansat în iulie 2017 de Changpeng Zhao (CZ) ca token ERC-20, migrat ulterior pe propriul blockchain în 2019.',
    originEn: 'Launched in July 2017 by Changpeng Zhao (CZ) via ICO, migrating to its native chain in 2019.',
    categoryLabelRo: 'Exchange & Layer 1 Ecosystem',
    categoryLabelEn: 'Exchange & Layer 1 Ecosystem',
    ecosystem: 'BNB Chain (PoSA / EVM)',
    keyPointsRo: [
      'Mecanism Auto-Burn trimestrial ce reduce oferta totală către ținta fixă de 100M BNB.',
      'Comisioane foarte mici și viteză mare de procesare compatibilă cu aplicațiile Ethereum (EVM).',
      'Susținut de cel mai mare volum de tranzacționare spot și derivatives din lume.'
    ],
    keyPointsEn: [
      'Automated programmatic quarterly burns targeting a permanent 100M BNB supply ceiling.',
      'Low transaction fees and high EVM tooling compatibility for consumer applications.',
      'Backed by the world’s largest spot and derivatives exchange ecosystem.'
    ]
  },
  XRP: {
    symbol: 'XRP',
    name: 'XRP Ledger (Ripple)',
    headlineRo: 'Rețea de plăți transfrontaliere rapide și lichiditate la cerere pentru instituții financiare.',
    headlineEn: 'High-speed cross-border settlement ledger designed for financial institutions and On-Demand Liquidity.',
    whatItDoesRo: 'XRP Ledger este un registru descentralizat optimizat pentru decontări financiare internaționale în 3-5 secunde, la costuri neglijabile.',
    whatItDoesEn: 'The XRP Ledger settles international transfers in 3-5 seconds with near-zero transaction costs.',
    coreUtilityRo: 'Monedă punte (bridge asset) pentru schimbul valutar instantaneu prin Ripple Payments (On-Demand Liquidity / ODL).',
    coreUtilityEn: 'Bridge currency for instant cross-currency liquidity via Ripple Payments (On-Demand Liquidity / ODL).',
    originRo: 'Creat în 2012 de Jed McCaleb, Arthur Britto și David Schwartz; susținut strategic de compania Ripple Labs.',
    originEn: 'Created in 2012 by Jed McCaleb, Arthur Britto, and David Schwartz; supported by Ripple Labs.',
    categoryLabelRo: 'Plăți Transfrontaliere & Instituțional',
    categoryLabelEn: 'Cross-Border Payments & Banking',
    ecosystem: 'XRP Ledger (Consensus Protocol / Zero PoW)',
    keyPointsRo: [
      'Finalitate a tranzacțiilor în doar 3-5 secunde fără consum intensiv de energie.',
      'Claritate juridică sporită în SUA după decizia judecătorească ce a stabilit statutul non-security pentru vânzările retail.',
      'Parteneriate cu bănci centrale și instituții financiare globale pentru plăți și remitențe.'
    ],
    keyPointsEn: [
      'Instant settlement finality in 3-5 seconds with near-zero carbon footprint.',
      'Clarified US regulatory status following landmark federal court non-security rulings on retail sales.',
      'Global institutional corridor liquidity and central bank digital currency (CBDC) partnerships.'
    ]
  },
  SUI: {
    symbol: 'SUI',
    name: 'Sui Network',
    headlineRo: 'Blockchain Layer 1 de generație nouă centrat pe obiecte, scris în limbajul Move.',
    headlineEn: 'Next-generation object-centric Layer 1 blockchain powered by the Move smart contract language.',
    whatItDoesRo: 'Sui utilizează un model de date bazat pe obiecte ce permite procesarea în paralel a tranzacțiilor fără conflicte și finalitate instantanee.',
    whatItDoesEn: 'Sui uses an object-centric data model allowing parallel execution of causal independent transactions.',
    coreUtilityRo: 'Gas token, staking validator, decontare DeFi și execuție de contracte inteligente ultra-rapide pentru gaming și aplicații on-chain.',
    coreUtilityEn: 'Gas token, staking, DeFi liquidity, and low-latency smart contracts for on-chain gaming and apps.',
    originRo: 'Dezvoltat de Mysten Labs (fondat de foști directori și arhitecți ai proiectului Diem / Libra de la Meta) și lansat în mai 2023.',
    originEn: 'Developed by Mysten Labs (founded by former Meta Diem/Libra lead architects) and launched in May 2023.',
    categoryLabelRo: 'Layer 1 Move Ecosystem',
    categoryLabelEn: 'Layer 1 Move Ecosystem',
    ecosystem: 'Sui (Mysticeti / Narwhal-Bullshark Consensus & Move)',
    keyPointsRo: [
      'Limbajul Move oferă securitate avansată la nivel de cod și previne vulnerabilitățile clasice de tip re-entrancy.',
      'Arhitectură bazată pe tranzacții paralele cu scalabilitate orizontală a throughput-ului.',
      'Creștere explozivă în TVL, volum DEX și adopție DeFi în 2024-2025.'
    ],
    keyPointsEn: [
      'Move language delivers native resource safety, eliminating classic re-entrancy attack vectors.',
      'Horizontal throughput scaling via parallelized object consensus (Mysticeti).',
      'Rapid institutional TVL and DEX volume growth across 2024-2025.'
    ]
  },
  LINK: {
    symbol: 'LINK',
    name: 'Chainlink',
    headlineRo: 'Rețeaua de oracole descentralizate de referință și standardul de interoperabilitate Web3 (CCIP).',
    headlineEn: 'The industry-standard decentralized oracle network and cross-chain interoperability protocol (CCIP).',
    whatItDoesRo: 'Chainlink conectează contractele inteligente din orice blockchain cu date din lumea reală (prețuri, API-uri, evenimente) și permite transferul de date și active între lanțuri prin CCIP.',
    whatItDoesEn: 'Chainlink connects smart contracts with verifiable real-world data and enables cross-chain interoperability via CCIP.',
    coreUtilityRo: 'Plata serviciilor de oracol, staking pentru securitatea feed-urilor de preț și decontarea mesajelor inter-blockchain.',
    coreUtilityEn: 'Node operator payments, oracle feed staking security, and cross-chain message settlement token.',
    originRo: 'Fondat în 2017 de Sergey Nazarov și Steve Ellis.',
    originEn: 'Founded in 2017 by Sergey Nazarov and Steve Ellis.',
    categoryLabelRo: 'Infrastructură & Oracole Web3',
    categoryLabelEn: 'Web3 Infrastructure & Oracles',
    ecosystem: 'Chainlink (CCIP / Data Feeds / Proof of Reserve)',
    keyPointsRo: [
      'Securizează zeci de miliarde de dolari în active DeFi (Aave, Compound, MakerDAO).',
      'Protocolul CCIP este testat și adoptat de giganți financiari precum Swift, DTCC și Euroclear pentru tokenizarea activelor reale (RWA).',
      'Mecanism Chainlink Staking v0.2 ce oferă randament nativ deținătorilor de LINK.'
    ],
    keyPointsEn: [
      'Secures tens of billions of dollars in active TVL across leading DeFi protocols.',
      'CCIP protocol adopted by institutional market infrastructures including Swift, DTCC, and Euroclear for RWAs.',
      'Chainlink Staking v0.2 securing node network with native token staking yield.'
    ]
  },
  AAVE: {
    symbol: 'AAVE',
    name: 'Aave',
    headlineRo: 'Protocolul lider mondial de creditare și împrumuturi descentralizate (DeFi Lending).',
    headlineEn: 'The leading decentralized non-custodial liquidity and lending protocol.',
    whatItDoesRo: 'Aave permite utilizatorilor să depună active crypto pentru a obține dobândă sau să împrumute fonduri oferind colateral, fără intermediari bancari.',
    whatItDoesEn: 'Aave allows users to supply crypto to earn yield and borrow assets against collateral non-custodially.',
    coreUtilityRo: 'Guvernanță DAO, staking în Safety Module (cu randament și protecție de protocol) și reduceri de comisioane la împrumuturi.',
    coreUtilityEn: 'DAO governance voting, Safety Module staking yield, and protocol fee discount utility.',
    originRo: 'Lansat inițial ca ETHLend în 2017 de Stani Kulechov, redenumit Aave în 2018.',
    originEn: 'Originally launched as ETHLend in 2017 by Stani Kulechov, rebranding to Aave in 2018.',
    categoryLabelRo: 'DeFi Lending & Liquidity',
    categoryLabelEn: 'DeFi Lending & Liquidity',
    ecosystem: 'Aave Protocol (V3 Multi-Chain / GHO Stablecoin)',
    keyPointsRo: [
      'Cea mai mare piață de creditare din DeFi cu peste $15-20B în active colaterale pe multiple rețele.',
      'Emitent al stablecoin-ului descentralizat GHO backed de colateral transparent.',
      'Model de afaceri ultra-profitabil cu venituri consistente din comisioane distribuite sau acumulate în trezorerie.'
    ],
    keyPointsEn: [
      'Largest lending market in DeFi with $15B+ collateral deployed across multiple chains.',
      'Issuer of decentralized overcollateralized stablecoin GHO.',
      'Consistently ranked as one of the most profitable protocols in crypto by net fee generation.'
    ]
  },
  FET: {
    symbol: 'FET',
    name: 'Artificial Superintelligence Alliance',
    headlineRo: 'Alianță descentralizată de inteligență artificială (Fetch.ai, SingularityNET, Ocean Protocol).',
    headlineEn: 'Decentralized Artificial Superintelligence Alliance uniting autonomous agents and AI data.',
    whatItDoesRo: 'Rețeaua permite crearea, antrenarea și monetizarea agenților AI autonomi capabili să execute sarcini complexe, optimizări de piețe și tranzacții automatizate.',
    whatItDoesEn: 'Enables developers to deploy and monetize autonomous AI agents that execute complex automated workflow tasks.',
    coreUtilityRo: 'Monedă de schimb pentru servicii AI, plata agenților autonomi, staking validator și guvernanță în alianța ASI.',
    coreUtilityEn: 'Payment token for AI computing and agent tasks, validator staking, and ASI collective governance.',
    originRo: 'Fondat în 2017 de Humayun Sheikh și Toby Simpson; unit în 2024 cu SingularityNET și Ocean Protocol.',
    originEn: 'Founded in 2017 by Humayun Sheikh and Toby Simpson; merged in 2024 with SingularityNET and Ocean Protocol.',
    categoryLabelRo: 'Crypto AI & Agenți Autonomi',
    categoryLabelEn: 'Crypto AI & Autonomous Agents',
    ecosystem: 'ASI Alliance / Fetch.ai Cosmos Hub',
    keyPointsRo: [
      'Alianță unificată ce concentrează cercetarea AGI deschisă și descentralizată.',
      'Infrastructură uAgents pentru conectarea modelelor LLM la execuție de tranzacții on-chain.',
      'Compatibilitate între rețele prin puntea nativă Cosmos / EVM.'
    ],
    keyPointsEn: [
      'Unified multi-billion-dollar alliance advancing open decentralized artificial general intelligence.',
      'uAgents framework connecting LLM models to programmatic on-chain execution.',
      'Interoperable architecture bridging Cosmos Hub, Ethereum, and EVM ecosystems.'
    ]
  },
  RENDER: {
    symbol: 'RENDER',
    name: 'Render Network',
    headlineRo: 'Rețeaua descentralizată de calcul grafic (GPU) pentru randare 3D, efecte vizuale și antrenare AI.',
    headlineEn: 'Decentralized GPU computing network for 3D rendering, spatial computing, and AI model inference.',
    whatItDoesRo: 'Render conectează creatorii care au nevoie de putere mare de calcul video/AI cu proprietarii de plăci grafice (GPU-uri) neutilizate din întreaga lume.',
    whatItDoesEn: 'Connects creators requiring compute power with decentralized GPU node operators worldwide.',
    coreUtilityRo: 'Plata joburilor de randare 3D, calcul AI/ML și recompensarea operatorilor de noduri GPU prin mecanismul Burn-and-Mint Equilibrium.',
    coreUtilityEn: 'Settlement token for rendering and AI compute jobs via Burn-and-Mint Equilibrium (BME).',
    originRo: 'Fondat în 2017 de Jules Urbach (CEO OTOY) și migrat pe blockchain-ul Solana în 2023.',
    originEn: 'Founded in 2017 by Jules Urbach (CEO of OTOY) and migrated to Solana in 2023.',
    categoryLabelRo: 'DePIN & GPU Cloud AI',
    categoryLabelEn: 'DePIN & GPU Cloud AI',
    ecosystem: 'Render Network (Solana BME Model)',
    keyPointsRo: [
      'Lider în sectorul DePIN (Decentralized Physical Infrastructure) pe segmentul de calcul GPU.',
      'Parteneriate și integrare directă cu suita software profesională OctaneRender de la OTOY.',
      'Expansiune masivă către task-uri de inferență și antrenare a modelelor de inteligență artificială.'
    ],
    keyPointsEn: [
      'Leading decentralized compute physical infrastructure (DePIN) network for GPU rendering.',
      'Native integration with industry-standard OctaneRender software used in Hollywood productions.',
      'Rapidly scaling compute capacity dedicated to machine learning and AI inference workloads.'
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. EQUITIES & MEGA-CAP TECH STOCKS
  // ─────────────────────────────────────────────────────────────────────────
  NVDA: {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    headlineRo: 'Liderul mondial indiscutabil în acceleratoare GPU pentru centre de date și infrastructură de calcul AI.',
    headlineEn: 'The dominant global leader in data center GPU accelerators and full-stack AI computing infrastructure.',
    whatItDoesRo: 'NVIDIA proiectează arhitecturi de procesoare grafice (GPU-uri Hopper H100/H200, Blackwell B200), rețelistică InfiniBand/Spectrum-X și platforma software proprietară CUDA care alimentează cele mai avansate modele de inteligență artificială din lume.',
    whatItDoesEn: 'NVIDIA designs GPU accelerators (Hopper, Blackwell), high-speed networking, and the CUDA software ecosystem powering global AI models.',
    coreUtilityRo: 'Calcul de înaltă performanță pentru antrenarea și inferența modelelor de limbaj (LLMs), supercomputere, grafică pentru jocuri video și conducere autonomă.',
    coreUtilityEn: 'High-performance computing for AI training/inference, hyperscale cloud data centers, autonomous vehicles, and gaming GPUs.',
    originRo: 'Fondată în 1993 de Jensen Huang, Chris Malachowsky și Curtis Priem în Santa Clara, California.',
    originEn: 'Founded in 1993 by Jensen Huang, Chris Malachowsky, and Curtis Priem in Santa Clara, California.',
    categoryLabelRo: 'Semiconductori & Infrastructură AI',
    categoryLabelEn: 'Semiconductors & AI Infrastructure',
    ecosystem: 'NASDAQ: NVDA (Arhitecturi CUDA, Tensor Core, Blackwell & DGX SuperPOD)',
    keyPointsRo: [
      'Moat tehnologic imens garantat de ecosistemul software CUDA pe care sunt construite 90%+ din modelele AI.',
      'Marje brute excepționale de peste 70-75% susținute de cererea masivă din partea giganților cloud (Microsoft, Google, Meta, Amazon).',
      'Lansarea arhitecturii Blackwell asigură conducerea tehnologică pe următorii ani cu eficiență energetică de 25x superioară.'
    ],
    keyPointsEn: [
      'Massive competitive moat underpinned by the ubiquitous CUDA software platform used by millions of AI developers.',
      'Exceptional gross margins (70-75%+) driven by hyperscaler AI cluster expansion (Microsoft, Google, Meta, AWS).',
      'Next-gen Blackwell B200 architecture extending compute density and energy efficiency leadership.'
    ]
  },
  AAPL: {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    headlineRo: 'Cea mai valoroasă companie de tehnologie de consum, renumită pentru iPhone, servicii recurente și ecosistemul integrat.',
    headlineEn: 'World-leading consumer hardware and services ecosystem spanning iPhone, Mac, and Apple Services.',
    whatItDoesRo: 'Apple proiectează, produce și comercializează smartphone-uri (iPhone), computere (Mac), tablete (iPad), dispozitive portabile (Apple Watch, AirPods) și un ecosistem vast de servicii digitale (iCloud, Apple Pay, App Store, Apple TV+).',
    whatItDoesEn: 'Designs and sells premium consumer electronics (iPhone, Mac, Watch) and a fast-growing digital services ecosystem (App Store, Pay, iCloud).',
    coreUtilityRo: 'Dispozitive de calcul personal premium cu experiență unificată hardware-software și servicii cu marje mari (74%+ marjă brută).',
    coreUtilityEn: 'Premium personal computing devices integrated with high-margin recurring services and on-device Apple Intelligence.',
    originRo: 'Fondată pe 1 aprilie 1976 de Steve Jobs, Steve Wozniak și Ronald Wayne în Cupertino, California.',
    originEn: 'Founded on April 1, 1976 by Steve Jobs, Steve Wozniak, and Ronald Wayne in Cupertino, California.',
    categoryLabelRo: 'Consumer Tech & Platforme Digitale',
    categoryLabelEn: 'Consumer Tech & Digital Platforms',
    ecosystem: 'NASDAQ: AAPL (iOS, macOS, Apple Silicon M-Series, Apple Intelligence)',
    keyPointsRo: [
      'Bază instalată activă de peste 2.2 miliarde de dispozitive ce generează venituri recurente din servicii.',
      'Putere excepțională de stabilire a prețurilor (pricing power) și retenție a clienților de peste 90%.',
      'Generare anuală masivă de flux de numerar liber ($100B+ FCF) returnată acționarilor prin răscumpărări și dividende.'
    ],
    keyPointsEn: [
      'Over 2.2 billion active device installed base generating high-margin recurring services revenue.',
      'Unmatched brand loyalty with customer retention rates exceeding 90% globally.',
      'Tremendous cash generator producing $100B+ annual Free Cash Flow dedicated to share buybacks and dividends.'
    ]
  },
  MSFT: {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    headlineRo: 'Gigantul global al software-ului enterprise, infrastructurii cloud (Azure) și pionier în integrarea AI (Copilot).',
    headlineEn: 'Global leader in enterprise software, cloud infrastructure (Azure), and commercial AI integration (Copilot).',
    whatItDoesRo: 'Microsoft oferă servicii de infrastructură cloud (Azure), productivitate enterprise (Microsoft 365, Teams), sisteme de operare (Windows), baze de date, rețeaua LinkedIn și divizia de gaming Xbox.',
    whatItDoesEn: 'Provides hyperscale cloud (Azure), enterprise productivity software (Office 365, Teams), Windows, LinkedIn, and gaming.',
    coreUtilityRo: 'Infrastructură critică pentru companii din întreaga lume, suita Copilot AI și găzduirea modelelor OpenAI pe Azure.',
    coreUtilityEn: 'Mission-critical enterprise software, Copilot productivity AI, and exclusive cloud infrastructure for OpenAI.',
    originRo: 'Fondată pe 4 aprilie 1975 de Bill Gates și Paul Allen în Albuquerque, New Mexico.',
    originEn: 'Founded on April 4, 1975 by Bill Gates and Paul Allen in Albuquerque, New Mexico.',
    categoryLabelRo: 'Cloud, SaaS & Enterprise AI',
    categoryLabelEn: 'Cloud, SaaS & Enterprise AI',
    ecosystem: 'NASDAQ: MSFT (Microsoft Azure, Office 365, GitHub, LinkedIn, Xbox)',
    keyPointsRo: [
      'Azure este al doilea cel mai mare cloud global cu rate de creștere de 30%+ YoY impulsionate de AI.',
      'Parteneriat strategic exclusiv cu OpenAI ce oferă acces timpuriu la cele mai performante modele AI comerciale.',
      'Bilanț financiar impecabil (rating de credit AAA) cu fluxuri de numerar foarte diversificate și stabile.'
    ],
    keyPointsEn: [
      'Azure cloud expanding at 30%+ annual growth driven by enterprise generative AI workloads.',
      'Exclusive strategic partnership with OpenAI commercializing advanced AI across the Microsoft stack.',
      'Elite AAA credit balance sheet with deeply diversified recurring enterprise revenue streams.'
    ]
  },
  TSLA: {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    headlineRo: 'Liderul tranziției către vehicule electrice, conducere autonomă (FSD), robotică (Optimus) și stocare de energie.',
    headlineEn: 'Pioneer in electric mobility, full self-driving (FSD) neural networks, robotics, and megawatt energy storage.',
    whatItDoesRo: 'Tesla proiectează și produce vehicule electrice (Model Y, Model 3, Cybertruck), sisteme de stocare a energiei (Megapack, Powerwall), rețele de încărcare Supercharger și dezvoltă tehnologii de autonomie bazate pe AI vizual.',
    whatItDoesEn: 'Manufactures electric vehicles, stationary battery energy systems (Megapack), and develops end-to-end vision AI for autonomous driving.',
    coreUtilityRo: 'Mobilitate sustenabilă, tranziție energetică prin baterii de rețea și viitoarea rețea de robo-taxiuri autonome.',
    coreUtilityEn: 'Sustainable transportation, grid-scale energy storage solutions, and upcoming autonomous Cybercab robotaxi networks.',
    originRo: 'Fondată în iulie 2003 de Martin Eberhard și Marc Tarpenning; condusă de Elon Musk din 2004.',
    originEn: 'Founded in 2003 by Martin Eberhard and Marc Tarpenning; led by CEO Elon Musk since 2004.',
    categoryLabelRo: 'Mobilitate Electrică & Robotică AI',
    categoryLabelEn: 'EV Mobility & AI Robotics',
    ecosystem: 'NASDAQ: TSLA (FSD Neural Networks, Tesla Megapack, Optimus Humanoid)',
    keyPointsRo: [
      'Cel mai bine vândut autoturism din lume (Tesla Model Y) și costuri de producție de referință în industrie.',
      'Divizia de stocare de energie (Megapack) crește exponențial (+100% YoY) cu marje de profit în expansiune rapidă.',
      'Cel mai mare set de date reale de condus din lume utilizat pentru antrenarea rețelelor neuronale FSD end-to-end.'
    ],
    keyPointsEn: [
      'Produces the world’s best-selling vehicle (Tesla Model Y) with industry-leading manufacturing efficiencies.',
      'Megapack grid energy storage division experiencing exponential +100% annual deployment growth.',
      'Massive real-world fleet video training dataset powering end-to-end neural network autonomous driving.'
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. COMMODITIES & PRECIOUS METALS
  // ─────────────────────────────────────────────────────────────────────────
  XAU: {
    symbol: 'XAU',
    name: 'Aur Fizic (Gold)',
    headlineRo: 'Principalul activ monetar de refugiu, protecție împotriva inflației și rezervă strategică a băncilor centrale.',
    headlineEn: 'The primary global monetary safe haven, inflation hedge, and central bank reserve asset.',
    whatItDoesRo: 'Aurul este cel mai vechi activ monetar de refugiu din istoria civilizației, cu valoare intrinsecă garantată de raritate, durabilitate și recunoaștere universală.',
    whatItDoesEn: 'Gold is the quintessential monetary safe haven, universally recognized for its scarcity, durability, and absence of counterparty risk.',
    coreUtilityRo: 'Protecția puterii de cumpărare împotriva devalorizării monedelor fiduciare, acoperire împotriva crizelor geopolitice și diversificare de portofoliu.',
    coreUtilityEn: 'Wealth preservation against currency debasement, geopolitical crisis hedge, and unencumbered central bank reserve tier-1 asset.',
    originRo: 'Utilizat ca monedă și etalon de valoare de peste 5.000 de ani în toate civilizațiile umane.',
    originEn: 'Used as standard of value and currency for over 5,000 years across human civilizations.',
    categoryLabelRo: 'Metale Prețioase & Rezervă Monetară',
    categoryLabelEn: 'Precious Metals & Monetary Reserve',
    ecosystem: 'Spot Metal (TROY OUNCE / XAUUSD)',
    keyPointsRo: [
      'Achiziții record efectuate de băncile centrale globale (China, India, Orientul Mijlociu) pentru de-dolarizarea rezervelor.',
      'Fără risc de contrapartidă sau faliment al emitentului.',
      'Corelație istorică inversă cu ratele reale ale dobânzilor din SUA.'
    ],
    keyPointsEn: [
      'Record central bank net gold purchases driven by reserve de-dollarization strategies.',
      'Zero counterparty default risk as a physical physical monetary bearer asset.',
      'Inverse historical correlation with real US Treasury yields and sovereign debt expansion.'
    ]
  },
  XAG: {
    symbol: 'XAG',
    name: 'Argint Fizic (Silver)',
    headlineRo: 'Metal prețios cu rol dublu: activ monetar de refugiu și componentă critică în panouri solare și electronice.',
    headlineEn: 'Precious monetary metal with essential industrial demand in solar PV panels and high-tech electronics.',
    whatItDoesRo: 'Argintul combină proprietățile unui metal prețios de investiție cu cererea industrială masivă datorată celei mai mari conductivități electrice și termice dintre toate metalele.',
    whatItDoesEn: 'Combines store-of-value monetary investment appeal with essential industrial demand in green energy technologies.',
    coreUtilityRo: 'Panouri fotovoltaice (energie solară), vehicule electrice, comutatoare electronice, monede și lingouri de investiție.',
    coreUtilityEn: 'Photovoltaic solar cells, electric vehicle power electronics, high-speed connectivity, and physical bullion investment.',
    originRo: 'Tranzacționat ca monedă și metal industrial de mii de ani.',
    originEn: 'Traded as currency and industrial metal for millennia.',
    categoryLabelRo: 'Metale Prețioase & Tranziție Energetică',
    categoryLabelEn: 'Precious Metals & Green Energy',
    ecosystem: 'Spot Metal (TROY OUNCE / XAGUSD)',
    keyPointsRo: [
      'Deficit structural de producție fizică pentru al patrulea an consecutiv.',
      'Consum accelerat din partea industriei energiei solare (panouri fotovoltaice de tip N / TOPCon ce necesită mai mult argint).',
      'Efect de levier istoric mai mare comparativ cu aurul în fazele avansate ale pieței taurine de mărfuri.'
    ],
    keyPointsEn: [
      'Structural multi-year physical supply deficit across global silver mining and recycling.',
      'Surging industrial consumption from next-gen TOPCon/HJT solar photovoltaic manufacturing.',
      'Historically demonstrates high-beta leverage to gold during broad commodity bull markets.'
    ]
  },
  XCU: {
    symbol: 'XCU',
    name: 'Cupru (Copper)',
    headlineRo: 'Metalul de bază al electrificării globale, rețelelor de energie regenerabilă și centrelor de date AI.',
    headlineEn: 'The cornerstone metal for global electrification, power grids, EVs, and AI data center infrastructure.',
    whatItDoesRo: 'Cuprul este cel mai eficient conductor economic de electricitate, esențial pentru rețelele electrice, cablaje, transformatoare, mașini electrice și generare eoliană/solară.',
    whatItDoesEn: 'Copper is the premier conductive metal indispensable for power grids, electric motors, and AI data center power distribution.',
    coreUtilityRo: 'Infrastructură electrică, generare de energie curată, motoare electrice și răcirea/alimentarea serverelor de calcul AI.',
    coreUtilityEn: 'Grid modernizations, renewable generation cabling, electric mobility, and hyperscale compute power distribution.',
    originRo: 'Unul dintre primele metale extrase și prelucrate de umanitate din mileniul 4 î.Hr.',
    originEn: 'One of the earliest metals smelted by civilization dating back to 4000 BC.',
    categoryLabelRo: 'Metale Industriale & Electrificare',
    categoryLabelEn: 'Industrial Metals & Electrification',
    ecosystem: 'Commodity Metal (POUND / TONNE / COMEX HG)',
    keyPointsRo: [
      'Indicator de bază al sănătății economice globale („Dr. Copper”).',
      'Deficit prognozat de marii producători din cauza complexității deschiderii de noi mine de cupru (8-12 ani durata de autorizare).',
      'Cerere masivă din partea centrelor de date pentru inteligență artificială care necesită zeci de mii de tone de cupru pentru alimentare.'
    ],
    keyPointsEn: [
      'Traditional leading barometer of global industrial economic health ("Dr. Copper").',
      'Long-term structural supply gap due to 10-15 year lead times required to permit and commission new Tier-1 mines.',
      'Surging demand from hyperscale AI data centers requiring extensive copper busbars and cooling infrastructure.'
    ]
  }
};

/**
 * Resolves or dynamically synthesizes a rich, authoritative asset profile
 * for any asset symbol, market class, category and name.
 */
export function getAssetProfile(
  symbol: string,
  marketClass?: string,
  category?: string,
  name?: string
): AssetProfile {
  const cleanSymbol = symbol.toUpperCase().replace(/^[$#]/, '').trim();

  // 1. Direct match in curated database
  if (ASSET_PROFILES_DATABASE[cleanSymbol]) {
    return ASSET_PROFILES_DATABASE[cleanSymbol];
  }

  // 2. Dynamic generation based on marketClass and category
  const isCrypto = marketClass === 'crypto';
  const isStock = marketClass === 'stocks';
  const isMetal = marketClass === 'metals';
  const displayName = name || cleanSymbol;
  const cat = category || (isCrypto ? 'Crypto Asset' : isStock ? 'Public Equity' : 'Commodity');

  if (isCrypto) {
    return {
      symbol: cleanSymbol,
      name: displayName,
      headlineRo: `Proiect criptografic din categoria ${cat}, monitorizat în scannerul Money Line.`,
      headlineEn: `Crypto asset categorized under ${cat}, actively tracked in the Money Line scanner.`,
      whatItDoesRo: `${displayName} ($${cleanSymbol}) este un protocol descentralizat sau token de utilitate ce activează în ecosistemul ${cat}. Permite decontarea tranzacțiilor și participarea la guvernanța sau utilitatea nativă a rețelei.`,
      whatItDoesEn: `${displayName} ($${cleanSymbol}) is a decentralized protocol/utility asset operating in the ${cat} ecosystem, enabling on-chain settlement, staking, or protocol utility.`,
      coreUtilityRo: `Comisioane de rețea, participare în aplicații descentralizate (DApps), mecanisme de staking sau lichiditate în ecosistemul ${cat}.`,
      coreUtilityEn: `Network transaction fees, decentralized application (DApp) utility, staking mechanics, and liquidity across the ${cat} sector.`,
      originRo: `Activ digital tranzacționat public pe bursele globale crypto, cu date verificate pe lanț și indicatori tehnici Money Line.`,
      originEn: `Publicly traded crypto asset tracked across major liquidity venues with verified on-chain metrics and Money Line indicators.`,
      categoryLabelRo: cat,
      categoryLabelEn: cat,
      ecosystem: `Ecosistem Web3 & Blockchain (${cleanSymbol})`,
      keyPointsRo: [
        `Activ integrat în categoria de narativă ${cat}.`,
        'Volum și lichiditate monitorizate în timp real prin adaptorul de date Binance / CoinGecko.',
        'Semnale tehnice și regim de trend evaluate pe baza algoritmului deterministic Money Line.'
      ],
      keyPointsEn: [
        `Asset categorized under the ${cat} market narrative.`,
        'Real-time liquidity and order flow monitored through verified market data feeds.',
        'Multi-timeframe trend structure and momentum calculated via deterministic Money Line signals.'
      ]
    };
  }

  if (isStock) {
    return {
      symbol: cleanSymbol,
      name: displayName,
      headlineRo: `Companie listată public din sectorul ${cat}, evaluată în scannerul de calitate și profitabilitate.`,
      headlineEn: `Publicly traded company in the ${cat} sector, tracked in the Money Line profitability scanner.`,
      whatItDoesRo: `${displayName} ($${cleanSymbol}) activează în sectorul ${cat}, dezvoltând produse, servicii și infrastructură pentru clienți comerciali și consumatori la nivel internațional.`,
      whatItDoesEn: `${displayName} ($${cleanSymbol}) operates in the ${cat} sector, developing products, services, and commercial solutions for global markets.`,
      coreUtilityRo: `Generare de venituri din vânzarea de produse/servicii în industria ${cat}, investiții în cercetare-dezvoltare și rentabilizarea capitalului acționarilor.`,
      coreUtilityEn: `Revenue generation across the ${cat} industry, ongoing capital expenditures, and shareholder value compounding.`,
      originRo: `Titlu tranzacționat pe bursele majore din SUA (NASDAQ / NYSE), cu raportări financiare oficiale către SEC (10-K, 10-Q).`,
      originEn: `Listed on major US exchanges (NASDAQ / NYSE) with periodic audited SEC regulatory filings (10-K, 10-Q).`,
      categoryLabelRo: cat,
      categoryLabelEn: cat,
      ecosystem: `Acțiuni Listate (${cleanSymbol})`,
      keyPointsRo: [
        `Companie activă în industria ${cat} cu evaluare fundamentală a marjelor și solvabilității.`,
        'Date istorice de tranzacționare și prețuri live sincronizate cu furnizori financiari verificați.',
        'Indicatori tehnici Money Line compuși (EMA 20/50/200, MACD, RSI, RVOL) pentru identificarea punctelor de inflexiune.'
      ],
      keyPointsEn: [
        `Operating in the ${cat} sector with fundamental margin and balance sheet analysis.`,
        'Live market prices and historical candles synced from institutional financial data feeds.',
        'Multi-timeframe Money Line momentum and trend regime tracking.'
      ]
    };
  }

  // Fallback for commodities/metals or other
  return {
    symbol: cleanSymbol,
    name: displayName,
    headlineRo: `Activ de piață din categoria ${cat}, monitorizat pentru dinamica prețului și trendul Money Line.`,
    headlineEn: `Market asset in the ${cat} sector, tracked for price momentum and Money Line trend regimes.`,
    whatItDoesRo: `${displayName} ($${cleanSymbol}) este un instrument tranzacționat pe piețele globale, reprezentând expunere pe mărfuri, indici sau active de referință.`,
    whatItDoesEn: `${displayName} ($${cleanSymbol}) is a global financial instrument representing exposure to commodities, indices, or benchmark assets.`,
    coreUtilityRo: `Diversificare de portofoliu, acoperire împotriva volatilității și speculație pe direcția trendului pe termen scurt și mediu.`,
    coreUtilityEn: `Portfolio diversification, volatility hedging, and trend capture across multiple investment horizons.`,
    originRo: `Instrument cu cotații live de pe piețele internaționale de referință.`,
    originEn: `Instrument priced across international benchmark commodity and derivative exchanges.`,
    categoryLabelRo: cat,
    categoryLabelEn: cat,
    ecosystem: `Piață Globală (${cleanSymbol})`,
    keyPointsRo: [
      `Expunere pe sectorul ${cat}.`,
      'Calcul deterministic al regimului de trend pe baza mediilor mobile și a volumului relativ.',
      'Niveluri dinamice de suport și rezistență calculate automat.'
    ],
    keyPointsEn: [
      `Exposure to the ${cat} sector.`,
      'Deterministic trend regime calculations based on multi-timeframe moving averages and volume.',
      'Dynamic automated support and resistance level tracking.'
    ]
  };
}
