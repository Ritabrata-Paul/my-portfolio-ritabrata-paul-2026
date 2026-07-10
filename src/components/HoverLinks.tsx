// Hover link label: renders the text twice so CSS can slide one copy up on
// hover. Used inside <a> tags in Navbar and SocialIcons.
interface HoverLinksProps {
  text: string;
}

const HoverLinks = ({ text }: HoverLinksProps) => {
  return (
    <div className="hover-links" data-cursor="disable">
      <span>{text}</span>
      <span>{text}</span>
    </div>
  );
};

export default HoverLinks;
