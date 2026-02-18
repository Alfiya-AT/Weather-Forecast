import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * AETHER WEATHER APP
 * A premium, glassmorphic React weather application.
 * Features: Current weather, 5-day history, 7-day strip, animated UI.
 */

const WEATHERSTACK_API_KEY = 'b087f69051908460b94ed65c77a15842'; // Replace with your actual key

const App = () => {
    const [activeTab, setActiveTab] = useState('Now');
    const [unit, setUnit] = useState('C'); // 'C' or 'F'
    const [query, setQuery] = useState('');
    const [weather, setWeather] = useState(null);
    const [pastWeather, setPastWeather] = useState([]);
    const [weekWeather, setWeekWeather] = useState([]);
    const [aqi, setAqi] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [condition, setCondition] = useState('Default'); // 'Rain', 'Storm', 'Sunny', 'Snow', 'Default'
    const [currentTime, setCurrentTime] = useState(new Date());

    const inputRef = useRef(null);

    // Auto-focus on mount
    useEffect(() => {
        if (inputRef.current) inputRef.current.focus();
    }, []);

    // Clock effect
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Initial search
    useEffect(() => {
        const defaultCity = 'London';
        setQuery(defaultCity);
        fetchWeather(defaultCity);
    }, []);

    const convertTemp = useCallback((temp) => {
        if (unit === 'F') return Math.round((temp * 9 / 5) + 32);
        return temp;
    }, [unit]);

    const formatTemp = useCallback((temp) => {
        return `${convertTemp(temp)}°${unit}`;
    }, [convertTemp, unit]);

    const determineCondition = (desc) => {
        const d = desc.toLowerCase();
        if (d.includes('rain') || d.includes('drizzle')) return 'Rain';
        if (d.includes('thunder') || d.includes('storm')) return 'Storm';
        if (d.includes('sun') || d.includes('clear')) return 'Sunny';
        if (d.includes('snow') || d.includes('ice') || d.includes('blizzard')) return 'Snow';
        return 'Default';
    };

    const fetchWeather = useCallback(async (location) => {
        if (!location) return;
        setLoading(true);
        setError(null);

        setWeather(null);
        setPastWeather([]);
        setWeekWeather([]);

        try {
            if (WEATHERSTACK_API_KEY === 'YOUR_API_KEY') {
                setTimeout(() => {
                    handleMockCurrent(location);
                    setLoading(false);
                }, 800);
                return;
            }

            const currentUrl = `http://api.weatherstack.com/current?access_key=${WEATHERSTACK_API_KEY}&query=${encodeURIComponent(location)}`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(currentUrl)}`;

            let data;
            try {
                const response = await fetch(currentUrl, { method: 'GET' });
                data = await response.json();
            } catch (directErr) {
                const response = await fetch(proxyUrl);
                const rawData = await response.json();
                data = rawData.contents ? JSON.parse(rawData.contents) : rawData;
            }

            if (data.error) {
                console.warn("API Error, falling back to Mock Data:", data.error.info);
                handleMockCurrent(location);
                return;
            }

            if (!data.current) {
                throw new Error('Invalid data structure');
            }

            setWeather(data);
            setCondition(determineCondition(data.current.weather_descriptions[0]));

            // Fetch history and AQI using coordinates
            const { lat, lon } = data.location;
            fetchHistoricalData(location, lat, lon);
            fetchAQI(lat, lon);

        } catch (err) {
            console.error("Fetch error:", err);
            setError("Could not reach weather services. Using simulation mode.");
            handleMockCurrent(location);
        } finally {
            setLoading(false);
        }
    }, [activeTab]);

    const handleMockCurrent = (location) => {
        const mock = {
            request: { query: location },
            location: { name: location, country: 'Aetheria', lat: "35.6895", lon: "139.6917", timezone_id: "Asia/Tokyo" },
            current: {
                temperature: 24,
                weather_descriptions: ["Sunny with a chance of Aether"],
                humidity: 45,
                wind_speed: 12,
                wind_degree: 140,
                wind_dir: "SE",
                pressure: 1012,
                cloudcover: 10,
                precip: 0,
                visibility: 10,
                uv_index: 6,
                feelslike: 26
            }
        };
        setWeather(mock);
        setCondition('Sunny');
        fetchHistoricalData(location, mock.location.lat, mock.location.lon);
        fetchAQI(mock.location.lat, mock.location.lon);
    };

    const fetchAQI = useCallback(async (lat, lon) => {
        try {
            const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide&timezone=auto`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.current) setAqi(data.current);
        } catch (err) {
            console.error("AQI fetch failed:", err);
        }
    }, []);

    const fetchHistoricalData = useCallback(async (location, lat, lon) => {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);

        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        try {
            const historyUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startStr}&end_date=${endStr}&daily=weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean&timezone=auto`;

            const response = await fetch(historyUrl);
            const data = await response.json();

            if (data.daily) {
                const formatted = data.daily.time.map((date, idx) => ({
                    date,
                    location: { name: location },
                    historical: {
                        [date]: {
                            maxtemp: Math.round(data.daily.temperature_2m_max[idx]),
                            mintemp: Math.round(data.daily.temperature_2m_min[idx]),
                            avgtemp: Math.round(data.daily.temperature_2m_mean[idx]),
                            hourly: [{
                                weather_descriptions: [mapMeteoCode(data.daily.weather_code[idx])],
                                wind_speed: 12
                            }]
                        }
                    }
                }));
                // Data comes in chronological order (oldest first)
                // For "Past" tab we might want most recent first?
                // But WeekStrip usually shows chronological.
                setPastWeather([...formatted].reverse());
                setWeekWeather(formatted);
            }
        } catch (err) {
            console.error("History fetch failed:", err);
            const dates = [];
            for (let i = 1; i <= 7; i++) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                dates.push(d.toISOString().split('T')[0]);
            }
            const mocks = dates.map(d => generateMockDay(d, location));
            setPastWeather(mocks);
            setWeekWeather([...mocks].reverse());
        }
    }, []);

    const generateMockDay = (date, loc) => {
        const conditions = ['Sunny', 'Partly Cloudy', 'Rain', 'Cloudy', 'Clear'];
        const cond = conditions[Math.floor(Math.random() * conditions.length)];
        return {
            date,
            location: { name: loc },
            historical: {
                [date]: {
                    maxtemp: 25 + Math.floor(Math.random() * 10),
                    mintemp: 15 + Math.floor(Math.random() * 5),
                    avgtemp: 20 + Math.floor(Math.random() * 7),
                    hourly: [{
                        weather_descriptions: [cond],
                        wind_speed: 10 + Math.floor(Math.random() * 15),
                    }]
                }
            },
            isMock: true
        };
    };


    const handleSearch = (e) => {
        if (e) e.preventDefault();
        if (!query.trim()) {
            inputRef.current.classList.add('shake');
            setTimeout(() => inputRef.current.classList.remove('shake'), 500);
            return;
        }
        fetchWeather(query);
    };

    const handleQuickCity = (city) => {
        setQuery(city);
        fetchWeather(city);
    };

    return (
        <div className="min-h-screen text-white overflow-x-hidden selection:bg-cyan-500/30">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,300;1,600&family=DM+Mono:wght@400;500&family=Syne:wght@400;700;800&display=swap');

                :root {
                    --accent-cyan: #00e5ff;
                    --accent-violet: #c084fc;
                    --accent-amber: #fbbf24;
                    --text-primary: rgba(255,255,255,0.95);
                    --text-secondary: rgba(255,255,255,0.55);
                    --text-tertiary: rgba(255,255,255,0.3);
                    --bg-dark: #060a1a;
                }

                * { box-sizing: border-box; }
                body { 
                    margin: 0; 
                    padding: 0; 
                    background: var(--bg-dark); 
                    font-family: 'Syne', sans-serif;
                    overflow-x: hidden;
                }

                .cormorant { font-family: 'Cormorant Garamond', serif; font-style: italic; }
                .dm-mono { font-family: 'DM Mono', monospace; }
                .syne { font-family: 'Syne', sans-serif; }

                /* Glassmorphism */
                .glass-card {
                    backdrop-filter: blur(24px) saturate(180%);
                    -webkit-backdrop-filter: blur(24px) saturate(180%);
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
                    transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
                    position: relative;
                    overflow: hidden;
                }
                .glass-card::before {
                    content: "";
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 50%;
                    height: 100%;
                    background: linear-gradient(
                        to right,
                        transparent,
                        rgba(255, 255, 255, 0.05),
                        transparent
                    );
                    transform: skewX(-25deg);
                    transition: 0.5s;
                }
                .glass-card:hover::before {
                    left: 150%;
                }
                .glass-card:hover {
                    background: rgba(255, 255, 255, 0.08);
                    border-color: rgba(255, 255, 255, 0.2);
                    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
                }

                /* Noise Grain */
                .noise {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    opacity: 0.04;
                    pointer-events: none;
                    z-index: 50;
                    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3%3Cfilter id='noiseFilter'%3%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3%3C/filter%3%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3%3C/svg%3");
                }

                /* Animations */
                @keyframes orbFloat {
                    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
                    33% { transform: translate(50px, -80px) scale(1.2) rotate(10deg); }
                    66% { transform: translate(-40px, 60px) scale(0.8) rotate(-10deg); }
                }

                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(30px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                @keyframes iconFloat {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-8px); }
                }

                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }

                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }

                @keyframes twinkle {
                    0%, 100% { opacity: 0.3; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.2); }
                }

                @keyframes glowPulse {
                    0%, 100% { box-shadow: 0 0 20px rgba(0, 229, 255, 0.2); }
                    50% { box-shadow: 0 0 40px rgba(0, 229, 255, 0.5); }
                }

                @keyframes floatSmall {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-5px); }
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                @keyframes drift {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(8px); }
                }

                @keyframes flash {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }

                .shake { animation: shake 0.4s ease-in-out; border-color: #ef4444 !important; }
                .animate-fadeUp { animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                .animate-iconFloat { animation: iconFloat 4s ease-in-out infinite; }
                .animate-twinkle { animation: twinkle var(--duration, 3s) infinite ease-in-out; }
                .animate-drift { animation: drift 4s ease-in-out infinite; }
                .animate-glowPulse { animation: glowPulse 3s infinite; }
                .animate-floatSmall { animation: floatSmall 2s ease-in-out infinite; }
                
                .shimmer-bg {
                    background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%);
                    background-size: 200% 100%;
                    animation: shimmer 1.2s infinite linear;
                }
                
                .card-hover-tilt {
                    perspective: 1000px;
                }
                .card-inner {
                    transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1);
                    transform-style: preserve-3d;
                }
                .card-hover-tilt:hover .card-inner {
                    transform: rotateX(2deg) rotateY(2deg);
                }

                /* Orbs */
                .orb {
                    position: fixed;
                    border-radius: 50%;
                    filter: blur(100px);
                    z-index: -1;
                    opacity: 0.4;
                    animation: orbFloat 25s infinite ease-in-out;
                    mix-blend-mode: screen;
                }

                /* Sun Arc */
                .sun-arc {
                    stroke-dasharray: 5, 5;
                }
            `}</style>

            <div className="noise" />
            <StarField />
            <OrbBackground condition={condition} />

            <div className="max-w-7xl mx-auto px-6 py-8 relative z-10">
                <Header unit={unit} setUnit={setUnit} time={currentTime} />

                <SearchBar
                    query={query}
                    setQuery={setQuery}
                    onSearch={handleSearch}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    loading={loading}
                    inputRef={inputRef}
                    onQuickCity={handleQuickCity}
                />

                {error && <div className="mt-8 glass-card p-6 rounded-3xl border-red-500/50 shadow-red-500/20 text-center animate-fadeUp">
                    <p className="text-red-400 text-lg mb-4">⚠️ {error}</p>
                    <button onClick={() => fetchWeather(query)} className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full transition-all">Retry</button>
                </div>}

                <div className="mt-12 space-y-12">
                    {loading && !weather ? (
                        <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                            <div className="w-20 h-20 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4" />
                            <p className="syne text-xl text-secondary">Interpreting sky signals...</p>
                        </div>
                    ) : activeTab === 'Now' ? (
                        <CurrentWeather data={weather} unit={unit} aqi={aqi} />
                    ) : (
                        <>
                            <PastWeather data={pastWeather} unit={unit} location={query} />
                            <WeekStrip data={weekWeather} unit={unit} location={query} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const StarField = React.memo(() => {
    const [stars, setStars] = useState([]);
    useEffect(() => {
        const s = Array.from({ length: 120 }).map((_, i) => ({
            id: i,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            size: `${Math.random() * 2 + 1}px`,
            duration: `${Math.random() * 3 + 2}s`,
            delay: `${Math.random() * 5}s`
        }));
        setStars(s);
    }, []);

    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
            {stars.map(star => (
                <div
                    key={star.id}
                    className="absolute bg-white rounded-full animate-twinkle"
                    style={{
                        top: star.top,
                        left: star.left,
                        width: star.size,
                        height: star.size,
                        '--duration': star.duration,
                        animationDelay: star.delay
                    }}
                />
            ))}
        </div>
    );
});

const OrbBackground = ({ condition }) => {
    const getColors = () => {
        switch (condition) {
            case 'Rain': return ['#3b82f6', '#1e3a8a', '#60a5fa'];
            case 'Storm': return ['#a855f7', '#4c1d95', '#c084fc'];
            case 'Sunny': return ['#f59e0b', '#7c2d12', '#fbbf24'];
            case 'Snow': return ['#e0f2fe', '#0c4a6e', '#f8fafc'];
            default: return ['#06b6d4', '#1e1b4b', '#8b5cf6'];
        }
    };

    const colors = getColors();

    return (
        <div className="fixed inset-0 pointer-events-none">
            <div className="orb w-[800px] h-[800px] top-[-200px] right-[-100px]" style={{ background: `radial-gradient(circle, ${colors[0]} 0%, transparent 70%)`, animationDuration: '30s' }} />
            <div className="orb w-[600px] h-[600px] bottom-[-100px] left-[-100px]" style={{ background: `radial-gradient(circle, ${colors[1]} 0%, transparent 70%)`, animationDuration: '40s', animationDelay: '-10s' }} />
            <div className="orb w-[500px] h-[500px] top-[20%] left-[30%]" style={{ background: `radial-gradient(circle, ${colors[2]} 0%, transparent 70%)`, animationDuration: '35s', animationDelay: '-15s' }} />
        </div>
    );
};

const Header = ({ unit, setUnit, time }) => (
    <header className="flex justify-between items-center animate-fadeUp">
        <div>
            <h1 className="text-3xl font-extrabold tracking-tighter syne text-white">AETHER<span className="text-cyan-400">.</span></h1>
            <p className="text-secondary dm-mono text-sm tracking-widest uppercase mt-1">Weather Intelligence</p>
        </div>
        <div className="flex items-center gap-8">
            <div className="text-right">
                <p className="dm-mono text-xl text-white">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                <p className="text-secondary text-xs uppercase tracking-widest">{time.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
            </div>
            <div className="flex bg-white/5 p-1 rounded-full border border-white/10">
                <button
                    onClick={() => setUnit('C')}
                    className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${unit === 'C' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/30' : 'text-white/50 hover:text-white'}`}
                >°C</button>
                <button
                    onClick={() => setUnit('F')}
                    className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${unit === 'F' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/30' : 'text-white/50 hover:text-white'}`}
                >°F</button>
            </div>
        </div>
    </header>
);

const SearchBar = ({ query, setQuery, onSearch, activeTab, setActiveTab, loading, inputRef, onQuickCity }) => {
    return (
        <div className="mt-12 animate-fadeUp" style={{ animationDelay: '0.1s' }}>
            <div className="flex gap-12 mb-8 border-b border-white/10">
                <button onClick={() => setActiveTab('Now')} className={`pb-4 px-2 text-lg font-bold transition-all relative ${activeTab === 'Now' ? 'text-white' : 'text-white/40 hover:text-white/60'}`}>
                    Now {activeTab === 'Now' && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-cyan-400" />}
                </button>
                <button onClick={() => setActiveTab('Past')} className={`pb-4 px-2 text-lg font-bold transition-all relative ${activeTab === 'Past' ? 'text-white' : 'text-white/40 hover:text-white/60'}`}>
                    Past {activeTab === 'Past' && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-cyan-400" />}
                </button>
            </div>

            <form onSubmit={onSearch} className="relative group">
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search city (e.g. Dubai, Tokyo, London)..."
                    className="w-full bg-white/5 border border-white/10 rounded-3xl py-6 px-10 text-xl syne focus:outline-none focus:border-cyan-500/50 focus:bg-white/10 transition-all placeholder:text-white/20"
                    disabled={loading}
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-cyan-500 text-black py-3 px-8 rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                >
                    {loading ? (
                        <div className="w-6 h-6 border-4 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : "Search"}
                </button>
            </form>

            <div className="flex gap-3 mt-6 overflow-x-auto no-scrollbar pb-2">
                {['Tokyo', 'London', 'New York', 'Dubai', 'Sydney', 'Paris'].map((city, i) => (
                    <button
                        key={city}
                        onClick={() => onQuickCity(city)}
                        className="px-6 py-2 rounded-full bg-white/5 border border-white/10 text-sm dm-mono hover:bg-white/10 hover:border-white/30 hover:scale-110 active:scale-90 transition-all whitespace-nowrap animate-fadeUp"
                        style={{ animationDelay: `${0.3 + (i * 0.05)}s` }}
                    >{city}</button>
                ))}
            </div>
        </div>
    );
};

const CountUp = ({ value, duration = 1000, fontClass = "" }) => {
    const [count, setCount] = useState(0);
    const startValue = 0;
    const startTimeRef = useRef(null);

    useEffect(() => {
        let animationFrame;
        const animate = (timestamp) => {
            if (!startTimeRef.current) startTimeRef.current = timestamp;
            const progress = timestamp - startTimeRef.current;
            const percentage = Math.min(progress / duration, 1);

            // easeOutExpo
            const easeValue = percentage === 1 ? 1 : 1 - Math.pow(2, -10 * percentage);

            setCount(Math.floor(easeValue * value));

            if (percentage < 1) {
                animationFrame = requestAnimationFrame(animate);
            }
        };
        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [value, duration]);

    return <span className={fontClass}>{count}</span>;
};

const CurrentWeather = ({ data, unit, aqi }) => {
    if (!data) return null;

    const { current, location } = data;
    const temp = current.temperature;
    const desc = current.weather_descriptions[0];

    const convert = (t) => (unit === 'F' ? Math.round((t * 9 / 5) + 32) : t);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeUp">
            {/* Hero Card */}
            <div className="lg:col-span-2 glass-card rounded-[3rem] p-12 relative overflow-hidden">
                <div className="absolute top-8 left-8 flex items-center gap-2 bg-white/10 px-4 py-1.5 rounded-full border border-white/10">
                    <span className="text-cyan-400">📍</span>
                    <span className="dm-mono text-sm font-medium tracking-wide">{location.name}, {location.country}</span>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center mt-12">
                    <div className="text-center md:text-left">
                        <div className="flex items-center justify-center md:justify-start">
                            <CountUp value={convert(temp)} fontClass="cormorant text-[10rem] leading-none text-white selection:text-cyan-500" />
                            <span className="text-4xl syne font-bold text-white/30 self-start mt-8">°{unit}</span>
                        </div>
                        <p className="cormorant text-4xl text-cyan-400 mt-[-1rem]">{desc}</p>
                    </div>
                    <div className="text-[10rem] animate-iconFloat md:mr-10">
                        {getEmoji(desc)}
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-16">
                    <StatBox label="Humidity" value={`${current.humidity}%`} icon="💧" />
                    <StatBox label="Wind" value={`${current.wind_speed} km/h`} icon="💨" />
                    <StatBox label="Pressure" value={`${current.pressure} mb`} icon="⏲️" />
                    <StatBox label="Cloud Cover" value={`${current.cloudcover}%`} icon="☁️" />
                    <StatBox label="Precip" value={`${current.precip} mm`} icon="🌧️" />
                    <StatBox label="Visibility" value={`${current.visibility} km`} icon="👁️" />
                </div>
            </div>

            {/* Side Panel */}
            <div className="space-y-8">
                <div className="glass-card rounded-[2.5rem] p-8">
                    <h4 className="text-secondary text-xs uppercase tracking-widest mb-6 dm-mono">UV Index</h4>
                    <div className="flex items-end justify-between mb-3 text-2xl syne font-bold">
                        <span>{getUVLabel(current.uv_index)}</span>
                        <span>{current.uv_index}</span>
                    </div>
                    <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-green-500 via-amber-400 to-red-500 transition-all duration-1000"
                            style={{ width: `${(current.uv_index / 11) * 100}%` }}
                        />
                    </div>
                </div>

                <div className="glass-card rounded-[2.5rem] p-8 flex flex-col items-center">
                    <h4 className="text-secondary text-xs uppercase tracking-widest self-start mb-6 dm-mono">Wind Direction</h4>
                    <Compass degree={current.wind_degree} />
                    <p className="mt-4 text-xl syne font-bold">{current.wind_dir}</p>
                </div>

                <div className="glass-card rounded-[2.5rem] p-8">
                    <h4 className="text-secondary text-xs uppercase tracking-widest mb-2 dm-mono">Feels Like</h4>
                    <div className="cormorant text-5xl">
                        <CountUp value={convert(current.feelslike)} />°
                    </div>
                    <p className="text-secondary mt-2">
                        {current.feelslike > current.temperature ? "Feels warmer than it is" : current.feelslike < current.temperature ? "Feels colder than it is" : "Feels about right"}
                    </p>
                </div>
            </div>

            {/* Second Row */}
            <div className="lg:col-span-2 glass-card rounded-[2.5rem] p-8 overflow-hidden">
                <h4 className="text-secondary text-xs uppercase tracking-widest mb-6 dm-mono">Hourly Forecast (Simulated)</h4>
                <div className="flex gap-4 overflow-x-auto no-scrollbar">
                    {generateHourly(current.temperature, unit).map((h, i) => (
                        <div key={i} className={`flex-shrink-0 w-24 p-5 rounded-3xl text-center transition-all ${h.isNow ? 'bg-cyan-500/20 border border-cyan-500/30 ring-1 ring-cyan-500/20' : 'bg-white/5 border border-white/10'}`}>
                            <p className="dm-mono text-xs text-secondary mb-3">{h.time}</p>
                            <div className="text-2xl mb-2">{h.emoji}</div>
                            <p className="syne font-bold">{h.temp}°</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* AQI Card */}
            <div className="glass-card rounded-[2.5rem] p-8">
                <h4 className="text-secondary text-xs uppercase tracking-widest mb-6 dm-mono">Air Quality (US AQI)</h4>
                {aqi ? (
                    <div className="space-y-6">
                        <div className="flex items-end justify-between">
                            <div>
                                <p className="text-3xl syne font-extrabold">{aqi.us_aqi}</p>
                                <p className={`text-sm font-bold ${aqi.us_aqi <= 50 ? 'text-green-400' : aqi.us_aqi <= 100 ? 'text-amber-400' : 'text-red-400'}`}>
                                    {getAQILabel(aqi.us_aqi)}
                                </p>
                            </div>
                            <span className="text-4xl">🫁</span>
                        </div>
                        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-1000"
                                style={{ width: `${Math.min(100, (aqi.us_aqi / 300) * 100)}%` }}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="bg-white/5 p-2 rounded-xl text-center">
                                <p className="text-[10px] text-secondary uppercase dm-mono">PM2.5</p>
                                <p className="text-xs font-bold">{aqi.pm2_5} μg/m³</p>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl text-center">
                                <p className="text-[10px] text-secondary uppercase dm-mono">NO₂</p>
                                <p className="text-xs font-bold">{aqi.nitrogen_dioxide} μg/m³</p>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl text-center">
                                <p className="text-[10px] text-secondary uppercase dm-mono">O₃</p>
                                <p className="text-xs font-bold">{aqi.ozone} μg/m³</p>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl text-center">
                                <p className="text-[10px] text-secondary uppercase dm-mono">SO₂</p>
                                <p className="text-xs font-bold">{aqi.sulphur_dioxide} μg/m³</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="animate-pulse space-y-4">
                        <div className="h-8 bg-white/10 rounded w-1/2" />
                        <div className="h-2 bg-white/10 rounded w-full" />
                        <div className="grid grid-cols-2 gap-4">
                            <div className="h-10 bg-white/10 rounded" />
                            <div className="h-10 bg-white/10 rounded" />
                        </div>
                    </div>
                )}
            </div>

            <div className="glass-card rounded-[2.5rem] p-8">
                <h4 className="text-secondary text-xs uppercase tracking-widest mb-6 dm-mono">Location Data</h4>
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-secondary dm-mono text-sm">Lat/Lon</span>
                        <span className="syne font-bold">{location.lat} / {location.lon}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-secondary dm-mono text-sm">Timezone</span>
                        <span className="syne font-bold">{location.timezone_id}</span>
                    </div>
                    <div className="mt-6 flex justify-center py-4">
                        <div className="relative w-24 h-24 border border-white/20 rounded-lg flex items-center justify-center overflow-hidden">
                            <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 opacity-20">
                                {Array.from({ length: 16 }).map((_, j) => <div key={j} className="border-[0.5px] border-white/30" />)}
                            </div>
                            <div className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse relative">
                                <div className="absolute inset-0 bg-cyan-400 rounded-full animate-ping" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sun Arc */}
            <div className="lg:col-span-2 glass-card rounded-[2.5rem] p-10">
                <h4 className="text-secondary text-xs uppercase tracking-widest mb-8 dm-mono text-center">Solar Cycle</h4>
                <div className="relative h-32 max-w-2xl mx-auto">
                    <svg className="w-full h-full" viewBox="0 0 200 60">
                        <path
                            d="M 10 50 Q 100 -20 190 50"
                            fill="none"
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth="1.5"
                            className="sun-arc"
                        />
                        <circle cx={calculateSunPos().x} cy={calculateSunPos().y} r="3" fill="#fbbf24" className="filter drop-shadow-[0_0_8px_#fbbf24]" />
                    </svg>
                    <div className="flex justify-between mt-2 dm-mono text-xs text-secondary">
                        <div className="text-left">
                            <span className="block text-white font-bold">06:42 AM</span>
                            <span>SUNRISE</span>
                        </div>
                        <div className="text-right">
                            <span className="block text-white font-bold">06:18 PM</span>
                            <span>SUNSET</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatBox = ({ label, value, icon }) => (
    <div className="glass-card p-4 rounded-2xl border-white/5 bg-white/[0.03]">
        <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">{icon}</span>
            <span className="text-secondary dm-mono text-[10px] uppercase tracking-wider">{label}</span>
        </div>
        <p className="syne font-bold text-white">{value}</p>
    </div>
);

const Compass = ({ degree }) => (
    <div className="relative w-32 h-32 border-2 border-white/10 rounded-full flex items-center justify-center">
        {['N', 'E', 'S', 'W'].map((d, i) => (
            <span key={d} className="absolute text-[10px] font-bold text-white/40" style={{
                top: i === 0 ? '5px' : i === 2 ? 'auto' : '50%',
                bottom: i === 2 ? '5px' : 'auto',
                left: i === 3 ? '5px' : i === 1 ? 'auto' : '50%',
                right: i === 1 ? '5px' : 'auto',
                transform: i === 1 || i === 3 ? 'translateY(-50%)' : 'translateX(-50%)'
            }}>{d}</span>
        ))}
        <div className="w-1 h-1 bg-white rounded-full" />
        <div
            className="absolute top-1/2 left-1/2 w-[1px] h-12 bg-gradient-to-t from-transparent via-cyan-400 to-cyan-400 origin-bottom transition-transform duration-1000"
            style={{ transform: `translateX(-50%) translateY(-100%) rotate(${degree}deg)` }}
        >
            <div className="w-2 h-2 bg-cyan-400 rounded-full absolute top-0 left-1/2 -translate-x-1/2 shadow-[0_0_10px_#00e5ff]" />
        </div>
    </div>
);

const PastWeather = ({ data, unit, location }) => {
    if (!location) return (
        <div className="text-center py-20 animate-fadeUp">
            <p className="syne text-2xl text-secondary">Discover the past.</p>
            <p className="dm-mono text-white/40 mt-2">Search for a city to unlock historical records.</p>
        </div>
    );

    if (data.length === 0) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="glass-card h-80 rounded-[2.5rem] shimmer-bg opacity-50" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6 animate-fadeUp">
            {data.map((day, i) => <PastCard key={i} data={day} unit={unit} index={i} />)}
        </div>
    );
};

const PastCard = ({ data, unit, index }) => {
    const isError = data.error;
    const dateObj = new Date(data.date || (data.historical && Object.keys(data.historical)[0]));
    const displayDate = dateObj.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

    // Weatherstack historical data structure is nested
    const hist = data.historical ? data.historical[Object.keys(data.historical)[0]] : null;
    const temp = hist ? hist.avgtemp : 0;
    const desc = hist ? hist.hourly[0].weather_descriptions[0] : "Unavailable";
    const accent = getConditionAccent(desc);

    const convert = (t) => (unit === 'F' ? Math.round((t * 9 / 5) + 32) : t);

    return (
        <div
            className={`glass-card rounded-[2.5rem] p-6 flex flex-col items-center text-center group border-b-4 transition-all duration-500`}
            style={{
                animationDelay: `${index * 150}ms`,
                borderBottomColor: accent,
                opacity: 0,
                transform: 'translateY(40px)',
                animation: `fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${index * 150}ms forwards`
            }}
        >
            <p className="dm-mono text-[10px] uppercase tracking-widest text-secondary mb-6">{displayDate}</p>

            <div className="text-6xl mb-4 group-hover:scale-110 transition-transform bounce-anim animate-iconFloat">
                {isError ? "❓" : getEmoji(desc)}
            </div>

            <div className="cormorant text-4xl mb-2">
                <CountUp value={convert(temp)} duration={600} />°
            </div>

            <Typewriter text={desc} className="syne text-xs font-bold text-secondary uppercase tracking-tighter mb-6 h-4" />

            <div className="w-full space-y-3 mt-auto">
                <div className="flex justify-between items-center text-[10px] dm-mono bg-white/5 px-3 py-1.5 rounded-full">
                    <span className="text-secondary">💧 Humidity</span>
                    <span>{hist ? hist.avgtemp : '-'}%</span>
                </div>
                <div className="flex justify-between items-center text-[10px] dm-mono bg-white/5 px-3 py-1.5 rounded-full">
                    <span className="text-secondary">💨 Wind</span>
                    <span>{hist ? hist.hourly[0].wind_speed : '-'}</span>
                </div>
            </div>
        </div>
    );
};

const WeekStrip = ({ data, unit, location }) => {
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' });
        }
    }, [data]);

    if (!data || data.length === 0) return null;

    return (
        <div className="relative animate-fadeUp" style={{ animationDelay: '0.4s' }}>
            <h4 className="text-secondary text-xs uppercase tracking-widest mb-6 dm-mono text-center">7-Day Analysis</h4>

            <div className="relative">
                {/* Fade Masks */}
                <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#060a1a] to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#060a1a] to-transparent z-10 pointer-events-none" />

                <div ref={scrollRef} className="flex gap-6 overflow-x-auto no-scrollbar pb-8 px-10">
                    {data.map((day, i) => (
                        <WeekCard key={i} data={day} unit={unit} index={i} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const WeekCard = ({ data, unit, index }) => {
    const histDate = data.historical ? Object.keys(data.historical)[0] : null;
    if (!histDate) return <div className="flex-shrink-0 w-40 h-64 glass-card rounded-3xl shimmer-bg opacity-20" />;

    const dayData = data.historical[histDate];
    const desc = dayData.hourly ? dayData.hourly[0].weather_descriptions[0] : "Cloudy";
    const accent = getConditionAccent(desc);
    const dateObj = new Date(histDate);
    const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'short' });

    const convert = (t) => (unit === 'F' ? Math.round((t * 9 / 5) + 32) : t);

    return (
        <div
            className="flex-shrink-0 w-40 h-64 glass-card rounded-[2rem] p-6 flex flex-col items-center justify-between text-center overflow-hidden group hover:translate-y-[-8px]"
            style={{
                animation: `fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${index * 80}ms forwards`,
                opacity: 0,
                transform: 'translateX(60px)'
            }}
        >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none" style={{ background: `radial-gradient(circle, ${accent} 0%, transparent 70%)` }} />

            <p className="syne font-bold text-sm tracking-widest">{dayName}</p>

            <div className="text-4xl group-hover:scale-125 transition-transform duration-500 my-2" style={{ animation: getConditionAnimation(desc) }}>
                {getEmoji(desc)}
            </div>

            <div className="space-y-1">
                <div className="syne font-bold text-2xl">{convert(dayData.maxtemp)}°</div>
                <div className="text-secondary text-xs">{convert(dayData.mintemp)}°</div>
            </div>

            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-4">
                <div className="h-full bg-cyan-400 group-hover:w-full transition-all duration-700" style={{ width: '0%', backgroundColor: accent, animation: 'growWidth 0.6s forwards 1s' }} />
            </div>

            <style>{`
                @keyframes growWidth { from { width: 0; } to { width: 100%; } }
            `}</style>
        </div>
    );
};

const Typewriter = ({ text, className }) => {
    const [display, setDisplay] = useState('');
    useEffect(() => {
        let i = 0;
        setDisplay('');
        const timer = setInterval(() => {
            if (i < text.length) {
                setDisplay(prev => prev + text.charAt(i));
                i++;
            } else {
                clearInterval(timer);
            }
        }, 50);
        return () => clearInterval(timer);
    }, [text]);
    return <p className={className}>{display}</p>;
};

// Helpers
const getEmoji = (desc) => {
    const d = desc.toLowerCase();
    if (d.includes('sun') || d.includes('clear')) return '☀️';
    if (d.includes('partly')) return '⛅';
    if (d.includes('cloud')) return '☁️';
    if (d.includes('thunder')) return '⛈️';
    if (d.includes('heavy rain')) return '🌧️';
    if (d.includes('rain')) return '🌦️';
    if (d.includes('snow')) return '❄️';
    if (d.includes('fog') || d.includes('mist')) return '🌫️';
    if (d.includes('wind')) return '🌬️';
    return '✨';
};

const getConditionAccent = (desc) => {
    const d = desc.toLowerCase();
    if (d.includes('sun') || d.includes('clear')) return '#fbbf24';
    if (d.includes('partly')) return '#94a3b8';
    if (d.includes('cloud')) return '#64748b';
    if (d.includes('rain')) return '#3b82f6';
    if (d.includes('thunder')) return '#7c3aed';
    if (d.includes('snow')) return '#bae6fd';
    if (d.includes('fog')) return '#5eead4';
    return '#00e5ff';
};

const getConditionAnimation = (desc) => {
    const d = desc.toLowerCase();
    if (d.includes('sun') || d.includes('clear')) return 'spin 8s linear infinite';
    if (d.includes('cloud')) return 'iconFloat 4s ease-in-out infinite';
    if (d.includes('rain')) return 'shake 1s ease-in-out infinite';
    if (d.includes('thunder')) return 'flash 0.4s infinite';
    return 'none';
};

const getUVLabel = (uv) => {
    if (uv <= 2) return 'Low';
    if (uv <= 5) return 'Medium';
    if (uv <= 7) return 'High';
    if (uv <= 10) return 'Very High';
    return 'Extreme';
};

const generateHourly = (baseTemp, unit) => {
    const hours = [];
    const currentH = new Date().getHours();
    for (let i = -4; i <= 8; i++) {
        const h = (currentH + i + 24) % 24;
        const time = `${h % 12 || 12}${h >= 12 ? 'PM' : 'AM'}`;
        const tempVar = Math.round(Math.sin(i / 2) * 5);
        const t = baseTemp + tempVar;
        hours.push({
            time,
            temp: unit === 'F' ? Math.round((t * 9 / 5) + 32) : t,
            emoji: getEmoji(i % 3 === 0 ? 'Cloudy' : 'Sunny'),
            isNow: i === 0
        });
    }
    return hours;
};

const calculateSunPos = () => {
    const now = new Date();
    const start = new Date(now).setHours(6, 0, 0, 0);
    const end = new Date(now).setHours(18, 0, 0, 0);
    const total = end - start;
    const elapsed = Math.max(0, Math.min(now.getTime() - start, total));
    const ratio = elapsed / total;

    // SVG coords for path "M 10 50 Q 100 -20 190 50"
    const x = 10 + ratio * 180;
    // Parabolic approximation for Q point
    const y = 50 - 4 * ratio * (1 - ratio) * 70;
    return { x, y };
};

const mapMeteoCode = (code) => {
    if (code === 0) return "Sunny";
    if ([1, 2, 3].includes(code)) return "Partly Cloudy";
    if ([45, 48].includes(code)) return "Fog";
    if ([51, 53, 55].includes(code)) return "Drizzle";
    if ([61, 63, 65, 80, 81, 82].includes(code)) return "Rain";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
    if ([95, 96, 99].includes(code)) return "Thunderstorm";
    return "Cloudy";
};

const getAQILabel = (aqi) => {
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy (Sensitive)';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
};

export default App;
