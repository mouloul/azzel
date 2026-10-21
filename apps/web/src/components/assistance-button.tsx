export function assistancePhoneHref(phone: string): string {
  return `tel:${phone.replace(/[\s().-]/g, '')}`;
}

export function AssistanceButton({ phone }: { phone: string }) {
  return (
    <a className="btn-contour" href={assistancePhoneHref(phone)}>
      Appeler l’équipe
    </a>
  );
}
