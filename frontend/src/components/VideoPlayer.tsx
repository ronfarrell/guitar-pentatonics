type Props = {
  videoPath: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

export default function VideoPlayer({ videoPath, videoRef }: Props) {
  return (
    <section className="video-card">
      <video ref={videoRef} controls>
        <source src={videoPath} type="video/mp4" />
      </video>
    </section>
  );
}
