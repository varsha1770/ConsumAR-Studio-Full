"use client";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

const plans = [
  {
    name: "Guest",
    price: "Free",
    description: "Try the magic instantly",
    features: [
      "2 Rescales per day",
      "1 USDZ conversion",
      "Centimeters only",
      "No login required",
      "Public history"
    ],
    cta: "Try Now",
    popular: false,
    color: "gray"
  },
  {
    name: "Free",
    price: "0",
    description: "Better experience with login",
    features: [
      "3 Rescales per day",
      "2 USDZ conversions",
      "60 Monthly Rescales",
      "Feet & Centimeters",
      "Personal Dashboard"
    ],
    cta: "Sign Up Free",
    popular: false,
    color: "blue"
  },
  {
    name: "Pro",
    price: "Custom",
    description: "Full power for professionals",
    features: [
      "20 Rescales per day",
      "250 Monthly Rescales",
      "100 Uploads per day",
      "Unlimited USDZ conversions",
      "All Units (MM, CM, M, FT, IN)",
      "10x History Downloads"
    ],
    cta: "Go Pro Now",
    popular: true,
    color: "purple"
  }
];

export default function Pricing() {
  return (
    <div id="pricing" className="py-24 relative overflow-hidden">
      {/* Background Blurs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-300/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-300/10 rounded-full blur-[150px] animate-pulse delay-1000"></div>
      </div>

      <div className="text-center mb-20 px-4">
        <h2 className="text-4xl md:text-5xl font-semibold text-gray-900 mb-6 tracking-tight">
          Choose Your <span className="bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">Power</span>
        </h2>
        <p className="text-gray-400 text-lg font-light max-w-2xl mx-auto">
          From quick experiments to professional workflows, we have a plan that fits your 3D needs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto px-6">
        {plans.map((plan) => (
          <div 
            key={plan.name}
            className={`relative group p-8 rounded-[2.5rem] border transition-all duration-500 hover:scale-[1.02] ${
              plan.popular 
                ? "bg-white/70 backdrop-blur-xl border-purple-200 shadow-[0_20px_50px_rgba(124,58,237,0.1)] ring-2 ring-purple-500/20" 
                : "bg-white/40 backdrop-blur-md border-white/60 shadow-xl"
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-semibold uppercase tracking-[0.2em] px-6 py-2 rounded-full shadow-lg">
                Most Popular
              </div>
            )}

            <div className="mb-8">
              <h3 className={`text-2xl font-semibold mb-2 ${
                plan.color === "purple" ? "text-purple-600" : plan.color === "blue" ? "text-blue-600" : "text-gray-600"
              }`}>
                {plan.name}
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-semibold text-gray-900">{plan.price === "Custom" ? "Contact" : `$${plan.price}`}</span>
                {plan.price !== "Free" && plan.price !== "Custom" && <span className="text-gray-400 font-medium text-sm">/mo</span>}
              </div>
              <p className="text-gray-400 text-sm mt-2 font-light">{plan.description}</p>
            </div>

            <ul className="space-y-4 mb-10">
              {plan.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-3 text-gray-700">
                  <CheckCircleIcon className={`w-5 h-5 flex-shrink-0 ${
                    plan.color === "purple" ? "text-purple-500" : plan.color === "blue" ? "text-blue-500" : "text-gray-400"
                  }`} />
                  <span className="text-sm font-medium">{feature}</span>
                </li>
              ))}
            </ul>

            <button 
              className={`w-full py-4 rounded-[1.25rem] font-medium transition-all duration-300 shadow-lg group-hover:shadow-xl group-hover:-translate-y-1 active:scale-[0.98] ${
                plan.popular 
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" 
                  : "bg-white text-gray-900 border border-gray-100 hover:border-indigo-200"
              }`}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-20 text-center">
        <p className="text-gray-400 text-sm font-medium">
          Secure payment processing. No hidden fees. Cancel anytime.
        </p>
      </div>
    </div>
  );
}
