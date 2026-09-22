"use client";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

const plans = [
  {
    name: "Guest",
    price: "Free",
    description: "Try the magic instantly",
    features: [
      "2 Image Uploads for 3D Generation",
      "2 Rescales per day",
      "10 Model uploads per day",
      "1 USDZ download per day",
      "Centimeters view only",
      "No login required"
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
      "5 Image Uploads for 3D Generation",
      "3 Rescales per day",
      "10 Model uploads per day",
      "2 USDZ downloads per day",
      "60 Monthly Rescales",
      "Feet & Centimeters view",
      "2 History Downloads"
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
      "10 Image Uploads for 3D Generation",
      "20 Rescales per day",
      "100 Model uploads per day",
      "Unlimited USDZ",
      "250 Monthly Rescales",
      "All Units (MM, CM, M, FT, IN)",
      "10 History Downloads",
      "Premium Support"
    ],
    cta: "Coming Soon",
    popular: true,
    color: "purple"
  }
];

export default function Pricing() {
  return (
    <div id="pricing" className="py-16 sm:py-20 md:py-24 relative overflow-hidden">
      {/* Background Blurs - Adjusted for mobile sizing */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-blue-300/10 rounded-full blur-[80px] sm:blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-purple-300/10 rounded-full blur-[100px] sm:blur-[150px] animate-pulse delay-1000"></div>
      </div>

      <div className="text-center mb-12 sm:mb-16 md:mb-20 px-4">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-gray-900 mb-4 sm:mb-6 tracking-tight">
          Choose Your <span className="bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-600 bg-clip-text text-transparent">Power</span>
        </h2>
        <p className="text-gray-500 sm:text-gray-400 text-base sm:text-lg font-light max-w-xl md:max-w-2xl mx-auto leading-relaxed">
          From quick experiments to professional workflows, we have a plan that fits your 3D needs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto px-4 sm:px-6">
        {plans.map((plan, index) => (
          <div
            key={plan.name}
            /* FIX: Removed max-w-md. Added exact width calculation (md:w-[calc(50%-1rem)]) and md:mx-auto to perfectly match the above columns */
            className={`relative group p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border transition-all duration-500 hover:scale-[1.02] 
      ${index === 2 ? "md:col-span-2 md:w-[calc(50%-1rem)] md:mx-auto lg:col-span-1 lg:w-full lg:mx-0" : ""} 
      ${plan.popular
                ? "bg-white/80 sm:bg-white/70 backdrop-blur-xl border-purple-200 shadow-[0_10px_40px_rgba(124,58,237,0.15)] sm:shadow-[0_20px_50px_rgba(124,58,237,0.1)] ring-2 ring-purple-500/20 mt-4 md:mt-0"
                : "bg-white/60 sm:bg-white/40 backdrop-blur-md border-white/60 shadow-lg sm:shadow-xl"
              }`}
          >
            {plan.popular && (
              <div className="absolute -top-4 sm:-top-5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] px-4 sm:px-6 py-1.5 sm:py-2 rounded-full shadow-lg whitespace-nowrap">
                Most Popular
              </div>
            )}

            <div className="mb-6 sm:mb-8">
              <h3 className={`text-xl sm:text-2xl font-semibold mb-1 sm:mb-2 ${plan.color === "purple" ? "text-purple-600" : plan.color === "blue" ? "text-blue-600" : "text-gray-600"
                }`}>
                {plan.name}
              </h3>
              <div className="flex items-baseline gap-1">
                <span className={`font-semibold text-gray-900 ${plan.price === "Custom" ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}`}>
                  {plan.price === "Custom" ? "Coming Soon" : `$${plan.price}`}
                </span>
                {plan.price !== "Free" && plan.price !== "Custom" && <span className="text-gray-400 font-medium text-xs sm:text-sm">/mo</span>}
              </div>
              <p className="text-gray-500 sm:text-gray-400 text-xs sm:text-sm mt-2 font-light leading-relaxed min-h-[40px] sm:min-h-[48px]">{plan.description}</p>
            </div>

            <ul className="space-y-3 sm:space-y-4 mb-8 sm:mb-10">
              {plan.features.map((feature, idx) => (
                <li key={idx} className="flex items-start sm:items-center gap-3 text-gray-700">
                  <CheckCircleIcon className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 sm:mt-0 ${plan.color === "purple" ? "text-purple-500" : plan.color === "blue" ? "text-blue-500" : "text-gray-400"
                    }`} />
                  <span className="text-xs sm:text-sm font-medium leading-tight">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              className={`w-full py-3.5 sm:py-4 rounded-xl sm:rounded-[1.25rem] font-medium text-sm sm:text-base transition-all duration-300 shadow-md sm:shadow-lg group-hover:shadow-xl group-hover:-translate-y-1 active:scale-[0.98] ${plan.popular
                ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                : "bg-white text-gray-900 border border-gray-200 hover:border-indigo-300"
                }`}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-12 sm:mt-16 md:mt-20 text-center px-4">
        <p className="text-gray-400 text-xs sm:text-sm font-medium">
          Secure payment processing. No hidden fees. Cancel anytime.
        </p>
      </div>
    </div>
  );
}
