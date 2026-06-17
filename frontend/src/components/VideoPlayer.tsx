type Props = {
  videoPath: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoKey: string;
  onTogglePlay: () => void;
};

export default function VideoPlayer({ videoPath, videoRef, videoKey, onTogglePlay }: Props) {
  return (
    <section className="video-card">
      <video key={videoPath} ref={videoRef} playsInline onClick={onTogglePlay} style={{ cursor: "pointer" }}>
        <source src={videoPath} type="video/mp4" />
      </video>
      <div> Key: {videoKey} </div>
    </section>
  );
}
