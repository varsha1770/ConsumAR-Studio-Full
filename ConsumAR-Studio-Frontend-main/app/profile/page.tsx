"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StudioHeader from "@/components/StudioHeader";
import ImageCropModal from "@/components/ImageCropModal";
import toast from "react-hot-toast";
import {
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  GlobeAmericasIcon,
  SparklesIcon,
  CheckCircleIcon,
  ArrowLeftIcon,
  PencilSquareIcon,
  CameraIcon,
  XMarkIcon,
  EyeIcon,
  AdjustmentsHorizontalIcon,
  LockClosedIcon,
  ExclamationTriangleIcon,
  ChatBubbleBottomCenterTextIcon,
  StarIcon as StarOutlineIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";

const COUNTRY_CODES = [
  { code: "+91", flag: "🇮🇳", name: "India (+91)" },
  { code: "+1", flag: "🇺🇸", name: "USA / Canada (+1)" },
  { code: "+44", flag: "🇬🇧", name: "UK (+44)" },
  { code: "+61", flag: "🇦🇺", name: "Australia (+61)" },
  { code: "+49", flag: "🇩🇪", name: "Germany (+49)" },
  { code: "+33", flag: "🇫🇷", name: "France (+33)" },
  { code: "+81", flag: "🇯🇵", name: "Japan (+81)" },
  { code: "+971", flag: "🇦🇪", name: "UAE (+971)" },
  { code: "+65", flag: "🇸🇬", name: "Singapore (+65)" },
  { code: "+86", flag: "🇨🇳", name: "China (+86)" },
  { code: "+55", flag: "🇧🇷", name: "Brazil (+55)" },
  { code: "+27", flag: "🇿🇦", name: "South Africa (+27)" },
  { code: "+82", flag: "🇰🇷", name: "South Korea (+82)" },
  { code: "+39", flag: "🇮🇹", name: "Italy (+39)" },
  { code: "+34", flag: "🇪🇸", name: "Spain (+34)" },
  { code: "+7", flag: "🇷🇺", name: "Russia (+7)" },
  { code: "+52", flag: "🇲🇽", name: "Mexico (+52)" },
  { code: "+966", flag: "🇸🇦", name: "Saudi Arabia (+966)" },
];

interface ProfileData {
  id?: string;
  name: string;
  email: string;
  image?: string | null;
  phoneNumber: string;
  gender: string;
  bio: string;
  comment: string;
  rating: number;
  country: string;
  tier: string;
  createdAt?: string;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [cropImageRaw, setCropImageRaw] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumberOnly, setPhoneNumberOnly] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const validatePhoneNumber = (val: string): string | null => {
    if (!val.trim()) return null;

    if (/[a-zA-Z]/.test(val)) {
      return "Alphabet characters are not allowed in phone numbers.";
    }

    if (/[^\d\s\-\(\)\+]/.test(val)) {
      return "Special symbols are not allowed in phone numbers.";
    }

    const cleanDigits = val.replace(/\D/g, "");
    if (cleanDigits.length > 10) {
      return `Phone number cannot exceed 10 digits (you entered ${cleanDigits.length} digits).`;
    }

    return null;
  };

  const handlePhoneChange = (val: string) => {
    setPhoneNumberOnly(val);
    setPhoneError(validatePhoneNumber(val));
  };

  const [formData, setFormData] = useState<ProfileData>({
    name: "",
    email: "",
    image: null,
    phoneNumber: "",
    gender: "Prefer not to say",
    bio: "",
    comment: "",
    rating: 5,
    country: "",
    tier: "FREE",
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchProfile();
    }
  }, [status]);

  const parsePhoneNumber = (fullPhone: string) => {
    if (!fullPhone) return;
    const matchedCountry = COUNTRY_CODES.find((c) => fullPhone.startsWith(c.code));
    if (matchedCountry) {
      setCountryCode(matchedCountry.code);
      setPhoneNumberOnly(fullPhone.slice(matchedCountry.code.length).trim());
    } else {
      setPhoneNumberOnly(fullPhone);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/user/profile");
      const data = await res.json();
      if (data.success && data.profile) {
        const p = data.profile;
        setFormData({
          name: p.name || "",
          email: p.email || session?.user?.email || "",
          image: p.image || null,
          phoneNumber: p.phoneNumber || "",
          gender: p.gender || "Prefer not to say",
          bio: p.bio || "",
          comment: p.comment || "",
          rating: p.rating ?? 5,
          country: p.country || "",
          tier: p.tier || "FREE",
          createdAt: p.createdAt,
        });

        if (p.phoneNumber) {
          parsePhoneNumber(p.phoneNumber);
        }
      } else {
        setFormData((prev) => ({
          ...prev,
          email: session?.user?.email || "",
          name: session?.user?.name || "",
        }));
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      toast.error("Failed to load profile data.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file (JPG, PNG, WEBP, AVIF).");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image size should be less than 8MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Url = reader.result as string;
      setCropImageRaw(base64Url);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch("/api/user/delete", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("Account deleted. Goodbye!");
        const { signOut } = await import("next-auth/react");
        signOut({ callbackUrl: "/" });
      } else {
        toast.error(data.error || "Failed to delete account.");
      }
    } catch (err) {
      toast.error("An error occurred during deletion.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const phoneErr = validatePhoneNumber(phoneNumberOnly);
    if (phoneErr) {
      setPhoneError(phoneErr);
      toast.error(`Phone Exception: ${phoneErr}`, { id: "profile-toast" });
      return;
    }

    setIsSaving(true);
    toast.loading("Saving profile updates...", { id: "profile-toast" });

    const fullPhoneNumber = phoneNumberOnly.trim() ? `${countryCode} ${phoneNumberOnly.trim()}` : "";

    try {
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          phoneNumber: fullPhoneNumber,
          gender: formData.gender,
          bio: formData.bio,
          comment: formData.comment,
          rating: formData.rating,
          country: formData.country,
          image: formData.image,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Profile saved successfully!", { id: "profile-toast" });
        setIsEditing(false);
      } else {
        throw new Error(data.error || "Failed to update profile");
      }
    } catch (error: any) {
      console.error("Save profile error:", error);
      toast.error(error.message || "Could not save profile changes.", { id: "profile-toast" });
    } finally {
      setIsSaving(false);
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fdfdfd]">
        <div className="relative flex items-center justify-center">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-indigo-600/20 border-t-indigo-600"></div>
          <div className="absolute h-8 w-8 animate-pulse rounded-full bg-indigo-600/10"></div>
        </div>
      </div>
    );
  }

  const initialLetter = (formData.name || formData.email || "U")[0].toUpperCase();

  return (
    <div className="min-h-screen bg-[#fcfcfd] text-slate-600 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <StudioHeader />

      {/* Hidden File Input for Avatar */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*,.avif"
        onChange={handleImageFileChange}
        className="hidden"
      />

      {/* BACKGROUND ACCENTS */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[80%] md:w-[50%] h-[50%] bg-indigo-200/30 blur-[80px] md:blur-[120px] rounded-full"></div>
        <div className="absolute top-[20%] -right-[5%] w-[60%] md:w-[40%] h-[40%] bg-purple-200/30 blur-[80px] md:blur-[100px] rounded-full"></div>
      </div>

      <main className="relative z-10 container mx-auto pt-6 md:pt-10 pb-16 md:pb-24 max-w-4xl px-4 sm:px-6 lg:px-8">
        
        {/* BACK NAVIGATION BUTTON */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors bg-white/80 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-sm"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
            Account Management
          </span>
        </div>

        {/* HERO CARD */}
        <div className="relative overflow-hidden bg-white/90 backdrop-blur-xl rounded-2xl md:rounded-3xl border border-slate-200/80 p-6 md:p-8 shadow-xl mb-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
            
            {/* AVATAR BADGE WITH VIEW FULL IMAGE & CAMERA UPLOAD */}
            <div className="relative group">
              <div
                onClick={() => {
                  if (formData.image) {
                    setShowImageModal(true);
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-extrabold shadow-lg shadow-indigo-500/20 border-2 border-white overflow-hidden relative cursor-pointer"
                title={formData.image ? "Click to view full image" : "Click to upload picture"}
              >
                {formData.image ? (
                  <img
                    src={formData.image}
                    alt={formData.name || "User Avatar"}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  initialLetter
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[9px] font-bold uppercase tracking-wider gap-1">
                  <EyeIcon className="w-4 h-4" />
                  <span>{formData.image ? "View" : "Upload"}</span>
                </div>
              </div>
              
              {/* CAMERA BADGE FOR UPLOADING / CHANGING PHOTO */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="absolute -bottom-1 -right-1 bg-white p-1.5 rounded-full shadow-md border border-slate-100 text-indigo-600 hover:text-indigo-700 hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                title="Upload new profile picture"
              >
                <CameraIcon className="w-4 h-4" />
              </button>
            </div>

            {/* USER OVERVIEW INFO */}
            <div className="flex-1 text-center sm:text-left space-y-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                  {formData.name || "User Profile"}
                </h1>
                <span className={`inline-flex items-center self-center sm:self-auto px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                  formData.tier === "PAID"
                    ? "bg-purple-50 text-purple-700 border-purple-200"
                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                }`}>
                  {formData.tier} Tier
                </span>
              </div>
              
              <p className="text-sm font-medium text-slate-500 flex items-center justify-center sm:justify-start gap-1.5 pt-0.5">
                <EnvelopeIcon className="w-4 h-4 text-slate-400" />
                {formData.email}
              </p>

              {formData.createdAt && (
                <p className="text-[11px] font-medium text-slate-400 pt-1">
                  Member since {new Date(formData.createdAt).toLocaleDateString([], { month: "long", year: "numeric" })}
                </p>
              )}

              {/* QUICK PHOTO ADJUST BUTTON */}
              {formData.image && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setCropImageRaw(formData.image!)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-100 transition-all cursor-pointer"
                  >
                    <AdjustmentsHorizontalIcon className="w-4 h-4" />
                    <span>Adjust Photo Zoom & Crop</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PROFILE FORM SECTION WITH EDIT TOGGLE */}
        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl md:rounded-3xl border border-slate-200/80 p-6 md:p-8 shadow-xl">
            
            {/* CARD HEADER WITH EDIT PROFILE BUTTON */}
            <div className="flex items-center justify-between gap-2 mb-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <PencilSquareIcon className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">Personal Details</h2>
              </div>

              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold text-xs uppercase tracking-wider transition-all border border-indigo-100 hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
                >
                  <PencilSquareIcon className="w-4 h-4" />
                  <span>Edit Profile</span>
                </button>
              ) : (
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                  Editing Active
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">
              
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <UserIcon className="w-4 h-4 text-indigo-500" />
                  Full Name
                </label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter your full name"
                  className={`w-full px-4 py-3 rounded-xl border text-slate-900 text-sm font-medium transition-all outline-none ${
                    isEditing
                      ? "border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                      : "border-slate-200/60 bg-slate-100/50 cursor-not-allowed text-slate-700"
                  }`}
                />
              </div>

              {/* Email (PERMANENTLY LOCKED & READ-ONLY) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <EnvelopeIcon className="w-4 h-4 text-slate-400" />
                  Email Address
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60 inline-flex items-center gap-1">
                    <LockClosedIcon className="w-3 h-3" />
                    Locked
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={formData.email}
                    disabled
                    readOnly
                    className="w-full px-4 py-3 rounded-xl border border-slate-200/80 bg-slate-100/80 text-slate-500 text-sm font-medium cursor-not-allowed outline-none select-none pr-10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <LockClosedIcon className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* PHONE NUMBER WITH COUNTRY FLAG & DIALING CODE DROPDOWN */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <PhoneIcon className="w-4 h-4 text-indigo-500" />
                  Phone Number
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  {/* Country Flag & Code Select */}
                  <div className="relative sm:w-48 shrink-0">
                    <select
                      disabled={!isEditing}
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className={`w-full px-3.5 py-3 rounded-xl border text-slate-900 text-sm font-medium transition-all outline-none appearance-none pr-8 ${
                        isEditing
                          ? "border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 cursor-pointer"
                          : "border-slate-200/60 bg-slate-100/50 cursor-not-allowed text-slate-700"
                      }`}
                    >
                      {COUNTRY_CODES.map((item) => (
                        <option key={`${item.code}-${item.name}`} value={item.code}>
                          {item.flag} {item.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                      ▼
                    </div>
                  </div>

                  {/* Phone Input */}
                  <input
                    type="tel"
                    disabled={!isEditing}
                    value={phoneNumberOnly}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="(555) 000-0000"
                    className={`flex-1 px-4 py-3 rounded-xl border text-slate-900 text-sm font-medium transition-all outline-none ${
                      phoneError
                        ? "border-red-500 bg-red-50/20 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-red-900"
                        : isEditing
                        ? "border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                        : "border-slate-200/60 bg-slate-100/50 cursor-not-allowed text-slate-700"
                    }`}
                  />
                </div>

                {/* INLINE PHONE EXCEPTION ERROR CALLOUT */}
                {phoneError && (
                  <div className="flex items-center gap-2 mt-2 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200/80 text-red-700 text-xs font-semibold animate-in fade-in duration-200 shadow-sm">
                    <ExclamationTriangleIcon className="w-4.5 h-4.5 shrink-0 text-red-500" />
                    <span>{phoneError}</span>
                  </div>
                )}
              </div>

              {/* Gender */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <UserIcon className="w-4 h-4 text-indigo-500" />
                  Gender
                </label>
                <select
                  disabled={!isEditing}
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className={`w-full px-4 py-3 rounded-xl border text-slate-900 text-sm font-medium transition-all outline-none ${
                    isEditing
                      ? "border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 cursor-pointer"
                      : "border-slate-200/60 bg-slate-100/50 cursor-not-allowed text-slate-700"
                  }`}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              {/* Country */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <GlobeAmericasIcon className="w-4 h-4 text-indigo-500" />
                  Country / Location
                </label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="e.g. India, United States, Germany"
                  className={`w-full px-4 py-3 rounded-xl border text-slate-900 text-sm font-medium transition-all outline-none ${
                    isEditing
                      ? "border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                      : "border-slate-200/60 bg-slate-100/50 cursor-not-allowed text-slate-700"
                  }`}
                />
              </div>

              {/* Short Bio */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <PencilSquareIcon className="w-4 h-4 text-indigo-500" />
                  Short Bio
                </label>
                <textarea
                  rows={3}
                  disabled={!isEditing}
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Share a quick description of your work or interest in 3D modeling..."
                  className={`w-full px-4 py-3 rounded-xl border text-slate-900 text-sm font-medium transition-all outline-none resize-none ${
                    isEditing
                      ? "border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                      : "border-slate-200/60 bg-slate-100/50 cursor-not-allowed text-slate-700"
                  }`}
                />
              </div>

              {/* Rating Selector (1 to 5 Stars) */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <StarSolidIcon className="w-4 h-4 text-amber-400" />
                  Your Studio Rating
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    {formData.rating || 5} / 5 Stars
                  </span>
                </label>
                <div className="flex items-center gap-2 py-1 px-4 rounded-xl border border-slate-200/80 bg-slate-50/50 w-fit">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      disabled={!isEditing}
                      onClick={() => setFormData({ ...formData, rating: star })}
                      className={`p-1 rounded-lg transition-transform ${
                        isEditing ? "cursor-pointer hover:scale-125 active:scale-95" : "cursor-not-allowed opacity-80"
                      }`}
                      title={isEditing ? `Rate ${star} Stars` : `${formData.rating || 5} Stars`}
                    >
                      {star <= (formData.rating || 5) ? (
                        <StarSolidIcon className="w-6 h-6 text-amber-400 drop-shadow-sm transition-colors" />
                      ) : (
                        <StarOutlineIcon className="w-6 h-6 text-slate-300 transition-colors" />
                      )}
                    </button>
                  ))}
                  <span className="text-xs font-bold text-slate-600 ml-2">
                    {formData.rating === 5
                      ? "Excellent 🌟"
                      : formData.rating === 4
                      ? "Very Good 👍"
                      : formData.rating === 3
                      ? "Good 👌"
                      : formData.rating === 2
                      ? "Fair 😐"
                      : "Poor 👎"}
                  </span>
                </div>
              </div>

              {/* Comment / Feedback */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <ChatBubbleBottomCenterTextIcon className="w-4 h-4 text-indigo-500" />
                  Comment / Feedback
                  <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    Public Studio Showcase
                  </span>
                </label>
                <textarea
                  rows={3}
                  disabled={!isEditing}
                  value={formData.comment}
                  onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                  placeholder="Share your thoughts, comments or feedback about ConsumAR Studio to display on the main page..."
                  className={`w-full px-4 py-3 rounded-xl border text-slate-900 text-sm font-medium transition-all outline-none resize-none ${
                    isEditing
                      ? "border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                      : "border-slate-200/60 bg-slate-100/50 cursor-not-allowed text-slate-700"
                  }`}
                />
              </div>

            </div>

            {/* ACTION BUTTONS (ONLY VISIBLE WHEN EDITING IS ACTIVE) */}
            {isEditing && (
              <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-end gap-4 animate-in fade-in duration-300">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    fetchProfile();
                  }}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider hover:bg-slate-50 transition-all active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <CheckCircleIcon className="w-4 h-4" />
                  )}
                  <span>{isSaving ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
            )}

          </div>
        </form>

        {/* DANGER ZONE - SELF-DESTRUCT PROTOCOL */}
        <div className="mt-8 p-1 relative overflow-hidden rounded-2xl md:rounded-3xl animate-in fade-in slide-in-from-bottom-6 duration-600">
          <div className="absolute inset-0 bg-gradient-to-br from-red-50 via-red-100/40 to-white backdrop-blur-lg"></div>

          <div className="relative bg-white/90 backdrop-blur-md border border-red-200 p-6 sm:p-8 rounded-2xl md:rounded-3xl flex flex-col md:flex-row items-center md:items-start justify-between gap-6 shadow-md">
            <div className="text-center md:text-left flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-100 border border-red-200 text-red-700 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3 shadow-sm">
                <ExclamationTriangleIcon className="w-4 h-4" />
                Terminal Security Layer
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 uppercase tracking-tight">
                Self‑Destruct Protocol
              </h2>
              <p className="mt-2 text-slate-600 font-medium max-w-md mx-auto md:mx-0 leading-relaxed text-xs sm:text-sm">
                Permanently eliminate your digital footprint. All associated GLB/USDZ models, telemetry, and configurations will be irreversibly atomized.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="group relative w-full md:w-auto px-6 py-3.5 bg-red-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-md hover:bg-red-700 hover:scale-[1.02] active:scale-95 transition-all overflow-hidden whitespace-nowrap cursor-pointer"
            >
              Initiate Wipe
            </button>
          </div>
        </div>

      </main>

      {/* FULL-SIZE PROFILE PICTURE LIGHTBOX MODAL */}
      {showImageModal && formData.image && (
        <div
          onClick={() => setShowImageModal(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl max-h-[85vh] p-3 sm:p-4 bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden flex flex-col items-center justify-center animate-in zoom-in-95 duration-300"
          >
            <button
              type="button"
              onClick={() => setShowImageModal(false)}
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-all cursor-pointer shadow-md"
              title="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>

            <img
              src={formData.image}
              alt={formData.name || "Profile Picture"}
              className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl border border-white/20"
            />

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowImageModal(false);
                  setCropImageRaw(formData.image!);
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <AdjustmentsHorizontalIcon className="w-4 h-4" />
                <span>Adjust Zoom & Crop</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowImageModal(false);
                  fileInputRef.current?.click();
                }}
                className="px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
              >
                <CameraIcon className="w-4 h-4" />
                <span>Upload New</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CROP & ZOOM EDITOR MODAL */}
      {cropImageRaw && (
        <ImageCropModal
          imageSrc={cropImageRaw}
          onClose={() => setCropImageRaw(null)}
          onCropComplete={(croppedDataUrl) => {
            setFormData((prev) => ({ ...prev, image: croppedDataUrl }));
            setCropImageRaw(null);
            toast.success("Photo adjusted cleanly! Click 'Save Changes' to apply.");
          }}
        />
      )}

      {/* REFINED SELF-DESTRUCT CONFIRMATION MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white border border-slate-100 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 shadow-2xl animate-in zoom-in-95 duration-300 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-80"></div>

            <div className="relative z-10">
              <div className="mx-auto flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-red-50 border border-red-100 mb-6 sm:mb-8 shadow-sm">
                <ExclamationTriangleIcon className="h-8 w-8 sm:h-10 sm:w-10 text-red-600" />
              </div>

              <h3 className="text-center text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3 sm:mb-4">
                Final <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-700">Warning</span>
              </h3>

              <p className="text-center text-slate-500 font-medium leading-relaxed mb-6 sm:mb-8 px-1 sm:px-2 text-xs sm:text-sm">
                This operation is <span className="text-red-600 font-bold tracking-wide">PERMANENT</span>. Once authorized, your workspace will be <strong className="text-slate-900">atomized</strong>. This cannot be undone.
              </p>

              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 sm:p-4 mb-6 sm:mb-8 shadow-sm">
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="mt-1 sm:mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  <p className="text-[9px] sm:text-[10px] font-bold text-slate-600 uppercase tracking-widest leading-relaxed">
                    DPDP Compliance Guarantee:<br /> <span className="text-emerald-700 font-extrabold tracking-wider">100% of your activity logs, history, and models will be permanently purged.</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 sm:gap-3">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteAccount}
                  className="group relative w-full h-12 sm:h-14 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-[0.15em] text-[10px] sm:text-[11px] shadow-lg shadow-red-600/20 transition-all active:scale-[0.98] disabled:opacity-50 overflow-hidden cursor-pointer"
                >
                  <div className="flex items-center justify-center gap-2 sm:gap-2.5 relative z-10">
                    {isDeleting ? (
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                        <span>Purging Data...</span>
                      </div>
                    ) : (
                      <>
                        <TrashIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span>Authorize Wipe</span>
                      </>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full h-12 sm:h-14 rounded-xl border border-slate-200 text-slate-500 font-bold uppercase tracking-widest text-[9px] sm:text-[10px] hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 transition-all active:scale-[0.98] cursor-pointer"
                >
                  Abort Sequence
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
