import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PortailCoreAuth } from './portail-core-auth';

describe('PortailCoreAuth', () => {
  let component: PortailCoreAuth;
  let fixture: ComponentFixture<PortailCoreAuth>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PortailCoreAuth],
    }).compileComponents();

    fixture = TestBed.createComponent(PortailCoreAuth);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
