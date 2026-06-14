type Props = {
  videoPath: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoKey: string;
};

export default function VideoPlayer({ videoPath, videoRef, videoKey }: Props) {
  return (
    <section className="video-card">
      <video ref={videoRef} controls>
        <source src={videoPath} type="video/mp4" />
      </video>
      <div> Key: {videoKey} </div>
    </section>
  );
}
