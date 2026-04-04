import fs from 'fs';
const landingHTML = `<!DOCTYPE html>
<html class="light" lang="es">
<head>
    <meta charset="utf-8"/>
    <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
    <title>Inter Red - High-Velocity Connectivity</title>
    <!-- Fonts -->
    <link href="https://fonts.googleapis.com" rel="preconnect"/>
    <link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet"/>
    <!-- Icons -->
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
    <!-- Tailwind -->
    <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
    <script id="tailwind-config">
          tailwind.config = {
            darkMode: "class",
            theme: {
              extend: {
                colors: {
                  primary: "#E30613", // Velocity Red
                  "on-primary": "#ffffff",
                  background: "#ffffff",
                  "on-background": "#000000",
                  surface: "#ffffff",
                  "on-surface": "#000000",
                  "surface-container": "#f4f4f4",
                  "surface-container-low": "#fafafa",
                  "surface-container-high": "#ebebeb",
                  outline: "#d1d1d1",
                  secondary: "#1a1a1a",
                  "on-secondary": "#ffffff",
                },
                fontFamily: {
                  headline: ["Plus Jakarta Sans", "sans-serif"],
                  body: ["Plus Jakarta Sans", "sans-serif"],
                  label: ["Plus Jakarta Sans", "sans-serif"],
                },
                borderRadius: {
                  DEFAULT: "0.5rem",
                  lg: "0.5rem",
                  xl: "0.75rem",
                  "2xl": "1rem",
                  "3xl": "1.5rem",
                  full: "9999px"
                },
              },
            },
          }
        </script>
    <style>
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        .velocity-blur {
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
        }
        .speed-gradient {
            background: linear-gradient(135deg, #000000 0%, #E30613 100%);
        }
        .text-stroke-white {
            -webkit-text-stroke: 1px rgba(255,255,255,0.3);
            color: transparent;
        }
    </style>
</head>
<body class="bg-background font-body text-on-background selection:bg-primary/20 selection:text-primary">
    <!-- TopAppBar Component -->
    <nav class="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md shadow-[0_10px_30px_rgba(227,6,19,0.08)]">
        <div class="flex justify-between items-center px-8 py-4 max-w-7xl mx-auto">
            <a href=\"index.html\" class=\"text-2xl font-black italic tracking-tighter text-red-600\">
                INTER RED
            </a>
            <div class=\"hidden md:flex items-center gap-8 font-plus-jakarta text-sm font-bold tracking-tight\">
                <a class=\"text-red-600 border-b-2 border-red-600 pb-1\" href=\"#planes\">Planes</a>
                <a class=\"text-neutral-700 hover:text-red-500 transition-all duration-200\" href=\"cobertura.html\">Cobertura</a>
                <a class=\"text-neutral-700 hover:text-red-500 transition-all duration-200\" href=\"#soporte\">Soporte</a>
            </div>
            <div class=\"flex items-center gap-4\">
                <a href=\"login.html\" class=\"bg-primary text-on-primary px-6 py-2 rounded-lg font-bold text-sm tracking-tight hover:scale-95 active:scale-90 transition-all\">
                    Admin
                </a>
            </div>
        </div>
    </nav>
    <main>
        <!-- Hero Section: High Velocity -->
        <section class=\"relative min-h-screen flex items-center pt-20 overflow-hidden bg-black\">
            <!-- Decorative Elements -->
            <div class=\"absolute inset-0 overflow-hidden\">
                <div class=\"absolute -top-[10%] -left-[10%] w-[60%] h-[60%] bg-primary/20 rounded-full blur-[120px]\"></div>
                <div class=\"absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[100px]\"></div>
                <!-- Grid Pattern -->
                <div class=\"absolute inset-0 opacity-[0.03]\" style=\"background-image: linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px); background-size: 50px 50px;\"></div>
            </div>
            <div class=\"relative z-10 max-w-7xl mx-auto px-8 w-full grid md:grid-cols-2 gap-16 items-center\">
                <div class=\"space-y-8\">
                    <div class=\"inline-flex items-center gap-2 bg-white/5 velocity-blur px-4 py-1.5 rounded-full border border-white/10\">
                        <span class=\"w-2 h-2 rounded-full bg-primary animate-pulse\"></span>
                        <span class=\"text-white text-[10px] font-bold tracking-[0.2em] uppercase\">Fibra Óptica Real</span>
                    </div>
                    <h1 class=\"font-headline text-6xl md:text-8xl font-extrabold text-white leading-tight tracking-tighter\">
                        CONECTANDO <span class=\"text-primary\">CHOYA</span>
                    </h1>
                    <p class=\"text-xl text-neutral-400 max-w-lg leading-relaxed font-medium\">
                        Experimenta la velocidad del futuro con nuestra red de fibra óptica de alta fidelidad. Sin cortes, sin esperas, solo conexión pura.
                    </p>
                    <div class=\"flex flex-wrap gap-4 pt-4\">
                        <a class=\"bg-primary text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-red-700 transition-all shadow-lg shadow-red-600/20\" href=\"#planes\">
                            Ver Planes
                        </a>
                        <button class=\"bg-transparent border-2 border-white/20 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/10 transition-all\">
                            Saber Más
                        </button>
                    </div>
                </div>
                <div class=\"relative hidden md:block\">
                    <div class=\"relative group\">
                        <div class=\"absolute -inset-1 bg-gradient-to-r from-primary to-black rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000\"></div>
                        <div class=\"relative rounded-3xl overflow-hidden bg-black aspect-square border border-white/10\">
                            <img alt=\"Tecnología de Red\" class=\"w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700\" src=\"https://lh3.googleusercontent.com/aida-public/AB6AXuCghVxmn8y4CaZCMhUfGDRuZmuGjA_JKeka9fvYhAB3UIX2Ps_Nmn8J-kFHlcZPkmht5nJO2lbyHYtnFrr8ioL1KOfLOMKrEZAavneddgnt_bp8_zsn50FjSAeDzxJltaaHlNS5mZvGG_0T0pOC6wCT4LLSmFVLUgvzVD-Tl_hrbL5SSfPw1JvVsnSiAaTi2erMGscvD64IHsmXr7Vbi_2nmAnxRnB2NKJxLu7F3A-myVOffSGYX4ZVJLGpmYZXRhUBWRGqNq1M_dM\"/>
                            <div class=\"absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent\"></div>
                            <div class=\"absolute bottom-8 left-8 right-8 p-6 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10\">
                                <div class=\"flex items-center gap-4\">
                                    <div class=\"bg-primary p-3 rounded-lg\">
                                        <span class=\"material-symbols-outlined text-white\" data-icon=\"speed\">speed</span>
                                    </div>
                                    <div>
                                        <div class=\"text-white font-black text-xl italic tracking-tighter\">1000 MBPS</div>
                                        <div class=\"text-white/40 text-[10px] uppercase font-bold tracking-widest\">Velocidad Simétrica</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        <!-- Planes Section -->
        <section class=\"py-32 px-8 bg-white\" id=\"planes\">
            <div class=\"max-w-7xl mx-auto\">
                <div class=\"flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20 border-l-8 border-primary pl-8\">
                    <div class=\"space-y-2\">
                        <h2 class=\"font-headline text-5xl font-black text-black tracking-tighter uppercase italic\">Planes a tu Medida</h2>
                        <p class=\"text-neutral-500 max-w-xl text-lg font-medium\">Soluciones de alta fidelidad para cada necesidad digital.</p>
                    </div>
                    <div class=\"text-sm font-bold text-neutral-400 uppercase tracking-widest\">Precios Finales</div>
                </div>
                <div class=\"grid grid-cols-1 md:grid-cols-3 gap-8\">
                    <!-- Plan Hogar -->
                    <div class=\"bg-white p-10 rounded-2xl border border-neutral-100 hover:border-primary/20 transition-all duration-500 group\">
                        <div class=\"mb-10\">
                            <span class=\"material-symbols-outlined text-neutral-400 group-hover:text-primary text-5xl mb-6 transition-colors\" data-icon=\"home\">home</span>
                            <h3 class=\"font-headline text-2xl font-black text-black mb-3 italic uppercase\">Plan Hogar</h3>
                            <p class=\"text-neutral-500 font-medium leading-relaxed\">Streaming y navegación fluida para toda la familia.</p>
                        </div>
                        <div class=\"mb-10 flex items-baseline gap-2\">
                            <span class=\"text-5xl font-black text-black\">$4.500</span>
                            <span class=\"text-neutral-400 font-bold uppercase text-xs tracking-widest\">/mes</span>
                        </div>
                        <ul class=\"space-y-5 mb-10\">
                            <li class=\"flex items-center gap-3 text-neutral-600 font-bold text-sm\">
                                <span class=\"material-symbols-outlined text-primary text-lg\" data-icon=\"bolt\">bolt</span>
                                50 MEGAS FIBRA
                            </li>
                            <li class=\"flex items-center gap-3 text-neutral-600 font-bold text-sm\">
                                <span class=\"material-symbols-outlined text-primary text-lg\" data-icon=\"wifi\">wifi</span>
                                WI-FI DE LARGO ALCANCE
                            </li>
                            <li class=\"flex items-center gap-3 text-neutral-600 font-bold text-sm\">
                                <span class=\"material-symbols-outlined text-primary text-lg\" data-icon=\"support\">support</span>
                                SOPORTE TÉCNICO LOCAL
                            </li>
                        </ul>
                        <a class=\"block text-center border-2 border-black text-black font-black uppercase italic py-4 rounded-lg hover:bg-black hover:text-white transition-all tracking-tighter\" href=\"https://wa.me/3855374835\">
                            Consultar
                        </a>
                    </div>
                    <!-- Plan Gaming (Featured) -->
                    <div class=\"bg-black p-10 rounded-2xl relative shadow-2xl shadow-primary/10 overflow-hidden transform md:-translate-y-4\">
                        <div class=\"absolute top-0 right-0 bg-primary text-white px-6 py-2 rounded-bl-lg font-black text-[10px] uppercase tracking-[0.2em] italic\">Recomendado</div>
                        <div class=\"mb-10\">
                            <span class=\"material-symbols-outlined text-primary text-5xl mb-6\" data-icon=\"sports_esports\">sports_esports</span>
                            <h3 class=\"font-headline text-2xl font-black text-white mb-3 italic uppercase\">Plan Gaming</h3>
                            <p class=\"text-neutral-400 font-medium leading-relaxed\">Baja latencia optimizada para gamers profesionales.</p>
                        </div>
                        <div class=\"mb-10 flex items-baseline gap-2\">
                            <span class=\"text-5xl font-black text-white\">$7.200</span>
                            <span class=\"text-neutral-500 font-bold uppercase text-xs tracking-widest\">/mes</span>
                        </div>
                        <ul class=\"space-y-5 mb-10\">
                            <li class=\"flex items-center gap-3 text-neutral-300 font-bold text-sm\">
                                <span class=\"material-symbols-outlined text-primary text-lg\" data-icon=\"speed\">speed</span>
                                100 MEGAS FIBRA
                            </li>
                            <li class=\"flex items-center gap-3 text-neutral-300 font-bold text-sm\">
                                <span class=\"material-symbols-outlined text-primary text-lg\" data-icon=\"track_changes\">track_changes</span>
                                BAJA LATENCIA (PING BAJO)
                            </li>
                            <li class=\"flex items-center gap-3 text-neutral-300 font-bold text-sm\">
                                <span class=\"material-symbols-outlined text-primary text-lg\" data-icon=\"verified\">verified</span>
                                INSTALACIÓN BONIFICADA
                            </li>
                        </ul>
                        <a class=\"block text-center bg-primary text-white font-black uppercase italic py-4 rounded-lg hover:bg-red-700 transition-all tracking-tighter\" href=\"https://wa.me/3855374835\">
                            Consultar
                        </a>
                    </div>
                    <!-- Plan Empresa -->
                    <div class=\"bg-white p-10 rounded-2xl border border-neutral-100 hover:border-primary/20 transition-all duration-500 group\">
                        <div class=\"mb-10\">
                            <span class=\"material-symbols-outlined text-neutral-400 group-hover:text-primary text-5xl mb-6 transition-colors\" data-icon=\"corporate_fare\">corporate_fare</span>
                            <h3 class=\"font-headline text-2xl font-black text-black mb-3 italic uppercase\">Plan Empresa</h3>
                            <p class=\"text-neutral-500 font-medium leading-relaxed\">Conectividad robusta para potenciar tu negocio.</p>
                        </div>
                        <div class=\"mb-10 flex items-baseline gap-2\">
                            <span class=\"text-5xl font-black text-black\">$12.500</span>
                            <span class=\"text-neutral-400 font-bold uppercase text-xs tracking-widest\">/mes</span>
                        </div>
                        <ul class=\"space-y-5 mb-10\">
                            <li class=\"flex items-center gap-3 text-neutral-600 font-bold text-sm\">
                                <span class=\"material-symbols-outlined text-primary text-lg\" data-icon=\"sync\">sync</span>
                                300 MEGAS SIMÉTRICOS
                            </li>
                            <li class=\"flex items-center gap-3 text-neutral-600 font-bold text-sm\">
                                <span class=\"material-symbols-outlined text-primary text-lg\" data-icon=\"dns\">dns</span>
                                IP FIJA OPCIONAL
                            </li>
                            <li class=\"flex items-center gap-3 text-neutral-600 font-bold text-sm\">
                                <span class=\"material-symbols-outlined text-primary text-lg\" data-icon=\"verified_user\">verified_user</span>
                                SLA DE RESPUESTA PRIORITARIA
                            </li>
                        </ul>
                        <a class=\"block text-center border-2 border-black text-black font-black uppercase italic py-4 rounded-lg hover:bg-black hover:text-white transition-all tracking-tighter\" href=\"https://wa.me/3855374835\">
                            Consultar
                        </a>
                    </div>
                </div>
            </div>
        </section>
        <!-- Sobre Nosotros (Local Section) -->
        <section class=\"py-32 px-8 bg-black text-white overflow-hidden\">
            <div class=\"max-w-7xl mx-auto grid md:grid-cols-2 gap-20 items-center\">
                <div class=\"relative order-2 md:order-1\">
                    <div class=\"grid grid-cols-2 gap-6\">
                        <div class=\"space-y-6\">
                            <div class=\"relative rounded-2xl overflow-hidden group\">
                                <img alt=\"Fibra en la calle\" class=\"w-full aspect-[4/5] object-cover grayscale brightness-50 group-hover:grayscale-0 group-hover:brightness-100 transition-all duration-700\" src=\"https://lh3.googleusercontent.com/aida-public/AB6AXuDei9pHfqm43GYXoZFGXmoeHcXsEkIygy8t0ikHVFrMyj8ZC7nW2VHXS-LNnGy4YQQ4JHNz0Hsd_6R5wC_oNGve3UgaNZoh0ooibsVmopMj16F9MgC3voySF_doYhVDrLfw4tZmzBQUB9bAR9P0rgDNAbwRnjIKZ17lyxMDGbZtk_7jDQ-hWoTcG441vS7yTLX6YsBGVHV5y4oT1YrvAFmqpvY9061uRjjvTj3vMQfCskVwYWdIcoF8YVhgtA6AtfBsq_8Gf90RJd0\"/>
                            </div>
                            <div class=\"bg-primary p-8 rounded-2xl text-white transform rotate-2\">
                                <div class=\"text-5xl font-black italic tracking-tighter mb-1 uppercase\">10+</div>
                                <div class=\"text-xs font-bold uppercase tracking-widest opacity-80\">Años de Liderazgo</div>
                            </div>
                        </div>
                        <div class=\"space-y-6 pt-12\">
                            <div class=\"bg-neutral-900 border border-white/10 p-8 rounded-2xl text-white transform -rotate-1\">
                                <div class=\"text-5xl font-black italic tracking-tighter mb-1 uppercase text-primary\">100%</div>
                                <div class=\"text-xs font-bold uppercase tracking-widest opacity-80\">Capital Local</div>
                            </div>
                            <div class=\"relative rounded-2xl overflow-hidden group\">
                                <img alt=\"Conexión global\" class=\"w-full aspect-[4/5] object-cover grayscale brightness-50 group-hover:grayscale-0 group-hover:brightness-100 transition-all duration-700\" src=\"https://lh3.googleusercontent.com/aida-public/AB6AXuCZIOweNedznk551Trf7y7rby6zGJPDWN4h_ZnZZgtOP-fIavagVY6AzheA5MuutZo5d-FbjryhFWpzOb093ahFve67qTZSRsKOOmhVu8gEJJaQLd_zbp5tzrukfSpu_Mnt0l8-lc_Oq1iKqgOn3twCHw4bc4eQlQ58ZOHNJ43QlbSoah1R3_8DK1ITb0mitSvxtwRJ2WU4cKUUiLPSUAgljeNvr85IGWbCSlR4kOgBt9BNSN-3W18swU-LLoFhJGJasXVLGeA8nnM\"/>
                            </div>
                        </div>
                    </div>
                </div>
                <div class=\"space-y-8 order-1 md:order-2\">
                    <div class=\"inline-block bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] italic\">Nuestra Historia</div>
                    <h2 class=\"font-headline text-5xl md:text-6xl font-black text-white leading-tight tracking-tighter uppercase italic\">La Raíz de <span class=\"text-primary\">Choya</span></h2>
                    <p class=\"text-lg text-neutral-400 leading-relaxed font-medium\">
                        Nacimos para eliminar fronteras digitales. Desde <span class=\"text-white font-bold italic\">Sol de Mayo</span> hasta <span class=\"text-white font-bold italic\">Frías</span>, cada metro de fibra es un compromiso con el desarrollo de nuestra comunidad. No somos solo un proveedor; somos tus vecinos.
                    </p>
                    <div class=\"grid grid-cols-1 gap-4 pt-4\">
                        <div class=\"flex items-center gap-4 p-5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors\">
                            <div class=\"w-10 h-10 bg-primary flex items-center justify-center rounded-lg\">
                                <span class=\"material-symbols-outlined text-white text-xl\" data-icon=\"location_on\">location_on</span>
                            </div>
                            <div>
                                <h4 class=\"font-black italic uppercase text-sm tracking-tighter\">Atención Presencial</h4>
                                <p class=\"text-xs text-neutral-500 font-bold uppercase tracking-widest\">Oficinas locales en cada región</p>
                            </div>
                        </div>
                        <div class=\"flex items-center gap-4 p-5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors\">
                            <div class=\"w-10 h-10 bg-primary flex items-center justify-center rounded-lg\">
                                <span class=\"material-symbols-outlined text-white text-xl\" data-icon=\"support_agent\">support_agent</span>
                            </div>
                            <div>
                                <h4 class=\"font-black italic uppercase text-sm tracking-tighter\">Soporte Humano 24/7</h4>
                                <p class=\"text-xs text-neutral-500 font-bold uppercase tracking-widest\">Hablamos tu idioma, sin bots</p>
                            </div>
                        </div>
                    </div>
                    <button class=\"flex items-center gap-4 font-headline font-black uppercase italic text-primary hover:gap-6 transition-all tracking-tighter pt-4\">
                        Nuestra Historia completa
                        <span class=\"material-symbols-outlined\" data-icon=\"arrow_forward\">arrow_forward</span>
                    </button>
                </div>
            </div>
        </section>
        <!-- Cobertura Section -->
        <section class=\"py-32 px-8 bg-white\" id=\"cobertura\">
            <div class=\"max-w-7xl mx-auto\">
                <div class=\"text-center space-y-4 mb-20\">
                    <h2 class=\"font-headline text-5xl font-black text-black tracking-tighter uppercase italic\">Nuestra Cobertura</h2>
                    <div class=\"w-24 h-2 bg-primary mx-auto\"></div>
                    <p class=\"text-neutral-500 max-w-xl mx-auto font-medium text-lg\">Extendiendo la fibra donde la velocidad es necesaria.</p>
                </div>
                <div class=\"relative group\">
                    <div class=\"absolute inset-0 bg-primary blur-[100px] opacity-5\"></div>
                    <div class=\"relative rounded-[2rem] overflow-hidden h-[600px] border border-neutral-100 shadow-2xl\">
                        <img alt=\"Mapa de cobertura\" class=\"w-full h-full object-cover grayscale opacity-10\" src=\"https://lh3.googleusercontent.com/aida-public/AB6AXuAqwJ2jJs7r-bM7G32AlX-ZT4oOri56sbbR9uqvG27BvBTrcRKFNGBUj1YnElmIpdDyriFPv9Kp8k8Pvx-ABvl0S9Sijd7PozFIPqN6wPYXOFWtcrk_henwDzphPye42DGlTOKdt8VJ2CCN2YZsqh_s9-LFsoNj1NY0_Wbrhf3zKtkFs4YwhEadTImNuAOQCj5ei_ep_fj76fB7ckd9XrUT5A80Bbu_nu_9AZ7uhF6Aay7PXSV3w89UYkVZMCLpb18qvza17k6eFeM\"/>
                        <div class=\"absolute inset-0 flex items-center justify-center p-8\">
                            <div class=\"bg-black text-white p-12 rounded-3xl max-w-md shadow-2xl text-center border border-white/10 velocity-blur\">
                                <span class=\"material-symbols-outlined text-6xl text-primary mb-6\" data-icon=\"hub\">hub</span>
                                <h3 class=\"font-headline text-3xl font-black italic uppercase tracking-tighter mb-6\">Zonas de Alcance</h3>
                                <div class=\"flex flex-wrap justify-center gap-3\">
                                    <span class=\"bg-white/10 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] border border-white/5\">Sol de Mayo</span>
                                    <span class=\"bg-white/10 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] border border-white/5\">Villa La Punta</span>
                                    <span class=\"bg-primary text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.2em]\">Choya</span>
                                    <span class=\"bg-white/10 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] border border-white/5\">San Pedro</span>
                                    <span class=\"bg-white/10 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] border border-white/5\">Frías</span>
                                </div>
                                <a href=\"cobertura.html\" class=\"mt-8 inline-block bg-white text-black px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all\">Ver Mapa Detallado</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </main>
    <!-- Footer Component -->
    <footer class=\"bg-neutral-950 w-full py-20 border-t border-white/5\" id=\"soporte\">
        <div class=\"grid grid-cols-1 md:grid-cols-3 gap-12 px-8 max-w-7xl mx-auto\">
            <div class=\"space-y-6\">
                <div class=\"font-bold text-white text-3xl italic font-black tracking-tighter uppercase\">Inter Red</div>
                <p class=\"text-neutral-500 font-medium leading-relaxed max-w-xs\">
                    La red más rápida de la región, impulsando el futuro digital de nuestra comunidad con tecnología de vanguardia.
                </p>
            </div>
            <div class=\"space-y-6\">
                <h4 class=\"font-plus-jakarta text-xs uppercase tracking-widest text-red-600 font-bold\">Enlaces Rápidos</h4>
                <ul class=\"space-y-4\">
                    <li><a class=\"text-neutral-400 hover:text-red-600 transition-colors font-medium text-sm\" href=\"https://wa.me/3855374835\">WhatsApp: 3855374835</a></li>
                    <li><a class=\"text-neutral-400 hover:text-red-600 transition-colors font-medium text-sm\" href=\"cobertura.html\">Sol de Mayo</a></li>
                    <li><a class=\"text-neutral-400 hover:text-red-600 transition-colors font-medium text-sm\" href=\"cobertura.html\">Villa La Punta</a></li>
                    <li><a class=\"text-neutral-400 hover:text-red-600 transition-colors font-medium text-sm\" href=\"cobertura.html\">Choya</a></li>
                    <li><a class=\"text-neutral-400 hover:text-red-600 transition-colors font-medium text-sm\" href=\"cobertura.html\">Frías</a></li>
                </ul>
            </div>
            <div class=\"space-y-6\">
                <h4 class=\"font-plus-jakarta text-xs uppercase tracking-widest text-red-600 font-bold\">Conectividad Directa</h4>
                <div class=\"flex gap-4\">
                    <a class=\"w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center hover:bg-primary transition-all group\" href=\"tel:3855374835\">
                        <span class=\"material-symbols-outlined text-white group-hover:scale-110 transition-transform\">call</span>
                    </a>
                    <a class=\"w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center hover:bg-primary transition-all group\" href=\"mailto:soporte@interred.com\">
                        <span class=\"material-symbols-outlined text-white group-hover:scale-110 transition-transform\">mail</span>
                    </a>
                    <a class=\"w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center hover:bg-primary transition-all group\" href=\"#\">
                        <span class=\"material-symbols-outlined text-white group-hover:scale-110 transition-transform\">share</span>
                    </a>
                </div>
            </div>
        </div>
        <div class=\"max-w-7xl mx-auto px-8 mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4\">
            <p class=\"font-plus-jakarta text-[10px] uppercase tracking-widest text-neutral-600\">© 2024 Inter Red. High-Velocity Connectivity.</p>
            <div class=\"flex items-center gap-2 text-neutral-600 text-[10px] uppercase tracking-widest\">
                <span>Hecho con</span>
                <span class=\"material-symbols-outlined text-[12px] text-red-600 fill-1\">favorite</span>
                <span>para la región</span>
            </div>
        </div>
    </footer>
</body>
</html>`;

fs.writeFileSync('index.html', landingHTML, 'utf8');
console.log("LANDING UPDATED");
