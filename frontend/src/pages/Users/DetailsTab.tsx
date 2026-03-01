import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";

interface DetailsTabProps {
  formData: {
    firstname: string;
    lastname: string;
    username: string;
    phone_number: string;
    email: string;
  };
  onChange: (name: string, value: string) => void;
  isLoading: boolean;
  countryCode?: string;
  onCountryCodeChange?: (code: string) => void;
}

export default function DetailsTab({
  formData,
  onChange,
  isLoading,
  countryCode = "+62",
  onCountryCodeChange,
}: DetailsTabProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    onChange(name, value);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="sm:col-span-1">
          <Label>
            Firstname <span className="text-error-500">*</span>
          </Label>
          <Input
            type="text"
            name="firstname"
            value={formData.firstname}
            onChange={handleChange}
            placeholder="Enter firstname"
            disabled={isLoading}
            required
          />
        </div>

        <div className="sm:col-span-1">
          <Label>
            Lastname <span className="text-error-500">*</span>
          </Label>
          <Input
            type="text"
            name="lastname"
            value={formData.lastname}
            onChange={handleChange}
            placeholder="Enter lastname"
            disabled={isLoading}
            required
          />
        </div>
      </div>

      <div>
        <Label>
          Username <span className="text-error-500">*</span>
        </Label>
        <Input
          type="text"
          name="username"
          value={formData.username}
          onChange={handleChange}
          placeholder="Enter username"
          disabled={isLoading}
          required
        />
      </div>

      <div>
        <Label>Telp</Label>
        <div className="flex gap-2">
          <select
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            disabled={isLoading}
            value={countryCode}
            onChange={(e) => onCountryCodeChange?.(e.target.value)}
          >
            <option value="+62">🇮🇩 +62</option>
            <option value="+1">🇺🇸 +1</option>
          </select>
          <Input
            type="tel"
            name="phone_number"
            value={formData.phone_number}
            onChange={handleChange}
            placeholder="0821-3351-3522"
            disabled={isLoading}
            className="flex-1"
          />
        </div>
      </div>

      <div>
        <Label>
          Email <span className="text-error-500">*</span>
        </Label>
        <Input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="Enter email"
          disabled={isLoading}
          required
        />
      </div>

    </div>
  );
}

