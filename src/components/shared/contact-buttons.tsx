"use client";

import { Mail, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuickActions } from "@/components/quick/quick-actions";
import { mailtoLink, telLink } from "@/lib/domain/phone";
import { cn } from "@/lib/utils";

interface Props {
  phone?: string | null;
  email?: string | null;
  name: string;
  leadId?: string;
  clientId?: string;
  opportunityId?: string;
  propertyId?: string;
  propertyLabel?: string;
  size?: "sm" | "default";
  withLabels?: boolean;
  className?: string;
}

/** Llamar / WhatsApp (con plantillas) / Email: acciones de contacto en un clic. */
export function ContactButtons({ phone, email, name, leadId, clientId, opportunityId, propertyId, propertyLabel, size = "sm", withLabels = false, className }: Props) {
  const { open } = useQuickActions();
  const tel = telLink(phone);
  const mail = mailtoLink(email);
  const btn = size === "sm" ? "icon-sm" : "icon";
  const labelled = withLabels;

  const item = (label: string, node: React.ReactNode) =>
    labelled ? (
      node
    ) : (
      <Tooltip>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );

  return (
    <div className={cn("flex items-center gap-1", className)} data-no-row-click>
      {item(
        tel ? "Llamar" : "Sin teléfono",
        <Button variant={labelled ? "outline" : "ghost"} size={labelled ? (size === "sm" ? "sm" : "default") : btn} disabled={!tel} asChild={Boolean(tel)} aria-label="Llamar">
          {tel ? (
            <a href={tel}>
              <Phone className="text-blue-600" />
              {labelled && "Llamar"}
            </a>
          ) : (
            <span>
              <Phone />
              {labelled && "Llamar"}
            </span>
          )}
        </Button>,
      )}
      {item(
        phone ? "WhatsApp" : "Sin teléfono",
        <Button
          variant={labelled ? "outline" : "ghost"}
          size={labelled ? (size === "sm" ? "sm" : "default") : btn}
          disabled={!phone}
          aria-label="WhatsApp"
          onClick={() => open("whatsapp", { phone: phone ?? null, name, leadId, clientId, opportunityId, propertyId, propertyLabel })}
        >
          <MessageCircle className="text-emerald-600" />
          {labelled && "WhatsApp"}
        </Button>,
      )}
      {item(
        mail ? "Enviar email" : "Sin email",
        <Button variant={labelled ? "outline" : "ghost"} size={labelled ? (size === "sm" ? "sm" : "default") : btn} disabled={!mail} asChild={Boolean(mail)} aria-label="Email">
          {mail ? (
            <a href={mail}>
              <Mail className="text-indigo-600" />
              {labelled && "Email"}
            </a>
          ) : (
            <span>
              <Mail />
              {labelled && "Email"}
            </span>
          )}
        </Button>,
      )}
    </div>
  );
}
